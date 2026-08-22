-- ============================================================================
-- Atomic Bo3 round lock-in (fixes a lost-update race that stranded rounds)
-- ============================================================================
--
-- The race
-- --------
-- `submit-prompt` decided "are both players locked in?" with a read-then-write
-- split across two statements:
--
--   :236-241  SELECT player_one_locked_at, player_two_locked_at  -- snapshot
--   :256      rpc lock_prompt(...)                               -- insert prompt
--   :275-292  UPDATE battle_rounds SET <my>_locked_at, both_locked_at?
--
-- `otherLocked` came from the snapshot taken BEFORE the prompt insert. Two
-- players submitting at the same moment both read "opponent not locked", so
-- neither set `both_locked_at` and neither invoked round-resolve. The round
-- then sat in waiting_for_prompts until its deadline and was swept as a
-- timeout -- a double forfeit for two players who both submitted on time.
--
-- The write was also unguarded (`.eq("id", round.id)` with no status
-- predicate), so it could stamp a round another request had already moved to
-- `resolving`.
--
-- The fix
-- -------
-- One function, one statement, decided under a row lock. `FOR UPDATE`
-- serializes concurrent callers; the second caller re-reads the first caller's
-- committed `locked_at` and correctly observes that both sides are now in.
--
-- Return contract:
--   both_locked      -- both sides are in (or the opponent is a bot)
--   should_resolve   -- TRUE for exactly ONE caller: the one whose update
--                       flipped both_locked_at from NULL. Without this, two
--                       near-simultaneous callers would both fire round-resolve;
--                       its CAS claim would make the second a no-op, but firing
--                       once is cheaper and clearer than relying on that.
--   already_locked   -- this side was already locked (idempotent retry)
--   status           -- round status, so the caller can 409 appropriately
--
-- Mirrors the atomic-claim idiom already used by
-- claim_forfeit_timeout_battles (20260708120000).
--
-- Note: lock_prompt still owns the single-format path and explicitly defers Bo3
-- to the caller ("Bo3 is owned by the submit-prompt Edge Function"). That
-- remains true -- ownership just moves from the Edge Function's JS to this
-- function, where it can be made atomic.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lock_round_side(
  p_battle_id    UUID,
  p_round_number INTEGER,
  p_profile_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_p1        BOOLEAN;
  v_is_bot       BOOLEAN;
  v_round_id     UUID;
  v_status       TEXT;
  v_prev_both    TIMESTAMPTZ;
  v_prev_mine    TIMESTAMPTZ;
  v_now_both     TIMESTAMPTZ;
BEGIN
  SELECT (b.player_one_id = p_profile_id), COALESCE(b.is_player_two_bot, FALSE)
    INTO v_is_p1, v_is_bot
  FROM battles b
  WHERE b.id = p_battle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Battle not found';
  END IF;

  IF v_is_p1 IS NULL THEN
    RAISE EXCEPTION 'Player not in this battle';
  END IF;

  -- Row lock: concurrent submitters queue here, and whoever goes second sees
  -- the first one's committed timestamp.
  SELECT r.id, r.status, r.both_locked_at,
         CASE WHEN v_is_p1 THEN r.player_one_locked_at ELSE r.player_two_locked_at END
    INTO v_round_id, v_status, v_prev_both, v_prev_mine
  FROM battle_rounds r
  WHERE r.battle_id = p_battle_id
    AND r.round_number = p_round_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found';
  END IF;

  IF v_status <> 'waiting_for_prompts' THEN
    RETURN jsonb_build_object(
      'both_locked',    v_prev_both IS NOT NULL,
      'should_resolve', FALSE,
      'already_locked', v_prev_mine IS NOT NULL,
      'status',         v_status
    );
  END IF;

  UPDATE battle_rounds r
  SET
    player_one_locked_at = CASE
      WHEN v_is_p1 THEN COALESCE(r.player_one_locked_at, NOW())
      ELSE r.player_one_locked_at END,
    player_two_locked_at = CASE
      WHEN NOT v_is_p1 THEN COALESCE(r.player_two_locked_at, NOW())
      ELSE r.player_two_locked_at END,
    both_locked_at = CASE
      WHEN r.both_locked_at IS NOT NULL THEN r.both_locked_at
      -- Bot opponents never lock in; the human's submission completes the round.
      WHEN v_is_bot THEN NOW()
      WHEN v_is_p1     AND r.player_two_locked_at IS NOT NULL THEN NOW()
      WHEN NOT v_is_p1 AND r.player_one_locked_at IS NOT NULL THEN NOW()
      ELSE NULL END,
    updated_at = NOW()
  WHERE r.id = v_round_id
  RETURNING r.both_locked_at INTO v_now_both;

  RETURN jsonb_build_object(
    'both_locked',    v_now_both IS NOT NULL,
    -- Exactly one caller sees the NULL -> NOT NULL transition.
    'should_resolve', (v_prev_both IS NULL AND v_now_both IS NOT NULL),
    'already_locked', v_prev_mine IS NOT NULL,
    'status',         v_status
  );
END;
$$;

COMMENT ON FUNCTION public.lock_round_side(UUID, INTEGER, UUID) IS
  'Atomically records one player''s Bo3 round lock-in and decides whether the '
  'round is now fully locked. Replaces a read-then-write in submit-prompt that '
  'lost updates when both players submitted simultaneously.';

REVOKE ALL ON FUNCTION public.lock_round_side(UUID, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_round_side(UUID, INTEGER, UUID)
  TO service_role;
