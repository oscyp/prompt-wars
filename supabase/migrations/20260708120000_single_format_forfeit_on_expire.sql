-- =============================================================================
-- Single-format auto-forfeit on expire (§7.5: "Auto-forfeit on expire")
-- =============================================================================
-- Previously `expire_timed_out_battles` set status='expired' for every
-- waiting_for_prompts battle past a deadline — even when one player had already
-- locked in. That player got nothing, contradicting §7.5 (and the Bo3 sweeper,
-- which already forfeits single-sided-lock rounds via round-resolve).
--
-- New split, mirroring the Bo3 path:
--   * Neither side locked        -> expire (this function, as before).
--   * Exactly one side locked    -> claimed by `claim_forfeit_timeout_battles`
--     and resolved as a forfeit win through the standard `resolve_battle`
--     pipeline (stats / streaks / rivals / ranked Glicko-2) by the
--     expire-battles Edge Function, which owns the rating computation.
--
-- Bo3 battles never match either path battle-level: per-round deadlines are
-- swept by expire-battles directly (battle_rounds.lock_in_deadline).
-- =============================================================================

CREATE OR REPLACE FUNCTION expire_timed_out_battles()
RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER;
BEGIN
  UPDATE battles
  SET status = 'expired'
  WHERE status = 'waiting_for_prompts'
    AND format = 'single'
    AND (
      (player_one_prompt_deadline < NOW() AND NOT EXISTS (
        SELECT 1 FROM battle_prompts WHERE battle_id = battles.id AND profile_id = player_one_id AND is_locked = TRUE
      ))
      OR
      (player_two_prompt_deadline < NOW() AND NOT EXISTS (
        SELECT 1 FROM battle_prompts WHERE battle_id = battles.id AND profile_id = player_two_id AND is_locked = TRUE
      ))
    )
    -- Single-sided locks are forfeits, not expiries (claim_forfeit_timeout_battles).
    AND NOT EXISTS (
      SELECT 1 FROM battle_prompts
      WHERE battle_id = battles.id AND is_locked = TRUE
    );

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomically claim single-format battles where exactly one player locked and
-- the other missed their deadline: flip them to 'resolving' (satisfying the
-- resolve_battle idempotency guard) and return everything the caller needs to
-- finish the forfeit, including Glicko-2 inputs for ranked battles. A battle
-- is returned at most once across concurrent sweeps because the UPDATE only
-- matches status='waiting_for_prompts'.
CREATE OR REPLACE FUNCTION claim_forfeit_timeout_battles()
RETURNS TABLE (
  battle_id UUID,
  winner_id UUID,
  loser_id UUID,
  mode battle_mode,
  winner_rating NUMERIC,
  winner_rating_deviation NUMERIC,
  winner_rating_volatility NUMERIC,
  loser_rating NUMERIC,
  loser_rating_deviation NUMERIC,
  loser_rating_volatility NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE battles b
    SET status = 'resolving'
    WHERE b.status = 'waiting_for_prompts'
      AND b.format = 'single'
      AND NOT b.is_player_two_bot
      AND b.player_one_id IS NOT NULL
      AND b.player_two_id IS NOT NULL
      AND (
        (
          b.player_two_prompt_deadline < NOW()
          AND EXISTS (
            SELECT 1 FROM battle_prompts bp
            WHERE bp.battle_id = b.id AND bp.profile_id = b.player_one_id AND bp.is_locked = TRUE
          )
          AND NOT EXISTS (
            SELECT 1 FROM battle_prompts bp
            WHERE bp.battle_id = b.id AND bp.profile_id = b.player_two_id AND bp.is_locked = TRUE
          )
        )
        OR
        (
          b.player_one_prompt_deadline < NOW()
          AND EXISTS (
            SELECT 1 FROM battle_prompts bp
            WHERE bp.battle_id = b.id AND bp.profile_id = b.player_two_id AND bp.is_locked = TRUE
          )
          AND NOT EXISTS (
            SELECT 1 FROM battle_prompts bp
            WHERE bp.battle_id = b.id AND bp.profile_id = b.player_one_id AND bp.is_locked = TRUE
          )
        )
      )
    RETURNING b.id, b.player_one_id, b.player_two_id, b.mode
  ),
  resolved AS (
    SELECT
      c.id AS c_battle_id,
      CASE WHEN EXISTS (
        SELECT 1 FROM battle_prompts bp
        WHERE bp.battle_id = c.id AND bp.profile_id = c.player_one_id AND bp.is_locked = TRUE
      ) THEN c.player_one_id ELSE c.player_two_id END AS c_winner_id,
      CASE WHEN EXISTS (
        SELECT 1 FROM battle_prompts bp
        WHERE bp.battle_id = c.id AND bp.profile_id = c.player_one_id AND bp.is_locked = TRUE
      ) THEN c.player_two_id ELSE c.player_one_id END AS c_loser_id,
      c.mode AS c_mode
    FROM claimed c
  )
  SELECT
    r.c_battle_id,
    r.c_winner_id,
    r.c_loser_id,
    r.c_mode,
    pw.rating,
    pw.rating_deviation,
    pw.rating_volatility,
    pl.rating,
    pl.rating_deviation,
    pl.rating_volatility
  FROM resolved r
  JOIN profiles pw ON pw.id = r.c_winner_id
  JOIN profiles pl ON pl.id = r.c_loser_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Service-role only: trusts nothing from the caller but mutates battle state.
REVOKE ALL ON FUNCTION claim_forfeit_timeout_battles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_forfeit_timeout_battles() TO service_role;
