-- =============================================================================
-- can_appeal: a forfeit is not an appealable loss
-- =============================================================================
-- The original checked only that the battle was ranked, that the caller did not
-- win it, and that they were under the 1/day cap. A forfeit sets
-- winner_id = opponent, so the forfeiter qualified -- meaning a player could
-- walk out of a battle and then appeal the loss they chose.
--
-- Live before this feature too: every expire-battles timeout forfeit has been
-- appealable on the same reasoning. Both are closed here, because an appeal is
-- a claim that the JUDGE got it wrong, and in a forfeit the judge never ran.
--
-- Keyed on score_payload.resolution + forfeited_profile_id, which is the shape
-- expire-battles already writes and which leave-battle now matches. The
-- forfeited_profile_id check matters: the WINNER of a forfeit is not appealing
-- anything (they won), but a draw-shaped payload or a future resolution kind
-- should not accidentally block the wrong player.

CREATE OR REPLACE FUNCTION can_appeal(
  p_profile_id UUID,
  p_battle_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_battle_mode battle_mode;
  v_winner_id UUID;
  v_score_payload JSONB;
  v_appeals_today INTEGER;
BEGIN
  -- Get battle info
  SELECT mode, winner_id, score_payload
  INTO v_battle_mode, v_winner_id, v_score_payload
  FROM battles WHERE id = p_battle_id;

  -- Only ranked losses can be appealed
  IF v_battle_mode != 'ranked' OR v_winner_id = p_profile_id OR v_winner_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- A forfeit is not a judging outcome. Nothing was scored, so there is
  -- nothing to appeal -- whether the player left on purpose or timed out.
  IF v_score_payload->>'resolution' IN ('forfeit', 'series_abandoned')
     AND v_score_payload->>'forfeited_profile_id' = p_profile_id::text THEN
    RETURN FALSE;
  END IF;

  -- Check daily cap
  SELECT COUNT(*) INTO v_appeals_today
  FROM appeals
  WHERE profile_id = p_profile_id
    AND created_at >= CURRENT_DATE;

  RETURN v_appeals_today < 1;
END;
$$ LANGUAGE plpgsql;

-- CREATE OR REPLACE re-runs the ddl_command_end event trigger that strips
-- PUBLIC EXECUTE, so the grants this function already held have to be restated
-- or appeals break. Restated exactly as they stand today (verified against the
-- live catalog, not the migrations): service_role because appeal-battle calls
-- it with a service client, authenticated because that grant predates this
-- change and narrowing it is a separate decision. can_appeal is SECURITY
-- INVOKER, so an authenticated caller reads battles and appeals under their own
-- RLS regardless.
GRANT EXECUTE ON FUNCTION public.can_appeal(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_appeal(UUID, UUID) TO authenticated;
