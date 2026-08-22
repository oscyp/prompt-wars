-- ============================================================================
-- Populate opponent_history and gate RATING GAIN on opponent diversity
-- ============================================================================
--
-- Two defects, both in §7.8's centrepiece anti-win-trading control.
--
-- 1. The table is never written to
-- ------------------------------
-- `opponent_history` has a table, two purpose-built indexes, an RLS policy and
-- a reader (`ranked_battles_vs_opponent_24h`). Nothing anywhere inserts into
-- it. A repo-wide search finds the table name only in its own migration.
--
-- So `ranked_battles_vs_opponent_24h` has always returned 0, and the diversity
-- check in matchmaking has always passed. The defence has never once run.
--
-- 2. It gates the wrong thing
-- ---------------------------
-- matchmaking consults it when PAIRING (matchmaking/index.ts:368-376). §7.8
-- specifies an "opponent diversity requirement for ranked rating GAINS" -- and
-- pairing is the wrong lever anyway: two colluders do not need the matchmaker
-- to face each other, they can use friend challenges or simply queue together.
-- Refusing to pair them also tells them they have been detected.
--
-- Gating the rating instead means the battle still happens, still resolves,
-- still shows a result -- it just stops moving the ladder once the same pair
-- has played repeatedly in a day. That is both harder to detect and harder to
-- work around.
--
-- What this migration does
-- ------------------------
--   * `record_opponent_history()` writes both directions of a completed
--     non-bot battle, idempotent per (profile, opponent, battle).
--   * a trigger on `battles` calls it, so history accrues wherever battles finish.
--   * `ranked_rating_is_diverse()` answers "should this result move rating?"
--     -- the check callers should use before applying deltas.
--
-- Threshold: RANKED_PAIR_DAILY_LIMIT of 3. Beyond three ranked battles against
-- the same opponent in 24h the result still stands but rating stops moving.
-- Three is deliberately permissive: friends laddering together in good faith is
-- normal, and the goal is to remove the incentive to farm, not to punish
-- people for having a regular sparring partner.
--
-- Idempotent: CREATE OR REPLACE + ON CONFLICT DO NOTHING.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_opponent_history_pair_battle
  ON public.opponent_history (profile_id, opponent_id, battle_id);

CREATE OR REPLACE FUNCTION public.record_opponent_history(p_battle_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  b        RECORD;
  v_rows   INTEGER := 0;
BEGIN
  SELECT id, player_one_id, player_two_id, mode, is_player_two_bot
    INTO b
  FROM battles
  WHERE id = p_battle_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Bots cannot collude, and a NULL opponent is an unmatched battle.
  IF COALESCE(b.is_player_two_bot, FALSE)
     OR b.player_one_id IS NULL
     OR b.player_two_id IS NULL
     OR b.player_one_id = b.player_two_id THEN
    RETURN 0;
  END IF;

  INSERT INTO opponent_history (profile_id, opponent_id, battle_id, battle_mode)
  VALUES
    (b.player_one_id, b.player_two_id, b.id, b.mode),
    (b.player_two_id, b.player_one_id, b.id, b.mode)
  ON CONFLICT (profile_id, opponent_id, battle_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.record_opponent_history(UUID) IS
  'Records both directions of a completed non-bot battle into opponent_history. '
  'Until this existed the table was never written and every diversity check '
  'silently passed.';

REVOKE ALL ON FUNCTION public.record_opponent_history(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_opponent_history(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- Should this ranked result move rating?
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ranked_rating_is_diverse(
  p_profile_id  UUID,
  p_opponent_id UUID,
  p_daily_limit INTEGER DEFAULT 3
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_profile_id IS NULL OR p_opponent_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM opponent_history
  WHERE profile_id = p_profile_id
    AND opponent_id = p_opponent_id
    AND battle_mode = 'ranked'
    AND created_at > NOW() - INTERVAL '24 hours';

  RETURN COALESCE(v_count, 0) <= p_daily_limit;
END;
$$;

COMMENT ON FUNCTION public.ranked_rating_is_diverse(UUID, UUID, INTEGER) IS
  'FALSE once a pair has exceeded the daily ranked limit against each other. '
  'Gates RATING GAIN, not pairing: §7.8 asks for a diversity requirement on '
  'rating, and refusing to pair merely tells colluders they were detected while '
  'friend challenges route around it anyway.';

REVOKE ALL ON FUNCTION public.ranked_rating_is_diverse(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ranked_rating_is_diverse(UUID, UUID, INTEGER)
  TO service_role;

-- ----------------------------------------------------------------------------
-- Accrue history wherever a battle completes
-- ----------------------------------------------------------------------------
--
-- A trigger rather than a call bolted onto resolve_battle: battles reach
-- 'completed' from several paths (resolve_battle, the Bo3 series finish in
-- battle-advance, forfeit claims and the double-no-show award in
-- expire-battles). Patching each one is how the original write came to be
-- missing everywhere. The trigger cannot be forgotten by a future path.

CREATE OR REPLACE FUNCTION public.battles_record_opponent_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
    PERFORM public.record_opponent_history(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_battles_record_opponent_history ON public.battles;

CREATE TRIGGER trg_battles_record_opponent_history
  AFTER UPDATE OF status ON public.battles
  FOR EACH ROW
  EXECUTE FUNCTION public.battles_record_opponent_history();
