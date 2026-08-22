-- =============================================================================
-- lock_prompt: round-aware idempotency and insert (Bo3 rounds 2-3 fix)
-- =============================================================================
-- Bug: the idempotency lookup in `lock_prompt` was keyed on
-- (battle_id, profile_id) WITHOUT round_number. For Bo3 rounds 2-3 the lookup
-- early-returned the ROUND-1 prompt id and never inserted a new row; the
-- `submit-prompt` Edge Function then retagged that round-1 row to the current
-- round, destroying round-1 linkage, and `round-resolve` (which selects
-- prompts by round_number) re-judged round-1 text. The per-round uniqueness
-- constraint `one_prompt_per_player_per_round (battle_id, profile_id,
-- round_number)` (20260525120000) has always allowed per-round rows — the
-- function just never used it.
--
-- This migration:
--   * Adds `p_round_number INTEGER DEFAULT 1` to `lock_prompt` and scopes BOTH
--     the idempotency lookup AND the INSERT to that round. The function stays
--     idempotent per (battle, profile, round). Because CREATE OR REPLACE
--     cannot change a function's signature, the old 6-arg overload is dropped
--     first (same approach as 20260623130000). Named-parameter RPC calls that
--     omit p_round_number still resolve via the DEFAULT, so an older deployed
--     `submit-prompt` keeps working during rollout (defaulting to round 1).
--   * Scopes the "both prompts locked -> resolving" count to the current round
--     (previously it counted ALL locked prompts across rounds; for single
--     format / round 1 the behavior is identical).
--   * Pins `SET search_path = public` (the function previously had no pin;
--     same hardening rationale as 20260731123000).
--   * Re-applies the service-role-only ACLs from 20260731122000 on the new
--     signature (DROP discards the old grants; CREATE re-grants to PUBLIC by
--     default).
--
-- All other behavior from the latest definition (20260731120000) is preserved:
-- participant validation, per-side lock timestamps on `battles`, status
-- transitions, moderation-status defaulting, word count, and the
-- single-format `battle_rounds` sync.
--
-- Idempotent: DROP ... IF EXISTS + CREATE OR REPLACE + REVOKE/GRANT.
-- =============================================================================

DROP FUNCTION IF EXISTS public.lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status);

CREATE OR REPLACE FUNCTION public.lock_prompt(
  p_battle_id UUID,
  p_profile_id UUID,
  p_prompt_template_id UUID DEFAULT NULL,
  p_custom_prompt_text TEXT DEFAULT NULL,
  p_move_type move_type DEFAULT 'attack',
  p_moderation_status moderation_status DEFAULT NULL,
  p_round_number INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prompt_id UUID;
  v_battle_status battle_status;
  v_word_count INTEGER;
  v_is_bot_battle BOOLEAN;
  v_moderation_status moderation_status;
  v_format battle_format;
  v_new_status battle_status;
  v_player_one_id UUID;
  v_player_two_id UUID;
  v_round_number INTEGER;
BEGIN
  v_round_number := COALESCE(p_round_number, 1);

  -- Matches the battle_prompts.round_number CHECK (BETWEEN 1 AND 3).
  IF v_round_number < 1 OR v_round_number > 3 THEN
    RAISE EXCEPTION 'Invalid round number %', v_round_number;
  END IF;

  SELECT status, is_player_two_bot, format, player_one_id, player_two_id
    INTO v_battle_status, v_is_bot_battle, v_format, v_player_one_id, v_player_two_id
  FROM battles WHERE id = p_battle_id;

  IF v_battle_status IS NULL THEN
    RAISE EXCEPTION 'Battle not found';
  END IF;

  IF p_profile_id IS NULL
     OR (p_profile_id IS DISTINCT FROM v_player_one_id
         AND p_profile_id IS DISTINCT FROM v_player_two_id) THEN
    RAISE EXCEPTION 'Player not in this battle';
  END IF;

  -- Single-format battles only ever have round 1.
  IF COALESCE(v_format, 'single'::battle_format) = 'single'
     AND v_round_number <> 1 THEN
    RAISE EXCEPTION 'Single-format battles only accept round 1';
  END IF;

  -- Idempotent return for retries on the same (battle, player, round).
  SELECT id INTO v_prompt_id
  FROM battle_prompts
  WHERE battle_id = p_battle_id
    AND profile_id = p_profile_id
    AND round_number = v_round_number;

  IF v_prompt_id IS NOT NULL THEN
    -- Retry path: make sure the per-side lock stamp exists (older battles or
    -- rows locked before 20260731120000). Only fires when currently NULL, so
    -- retries never emit spurious Realtime UPDATEs.
    UPDATE battles
    SET player_one_locked_at = NOW()
    WHERE id = p_battle_id
      AND p_profile_id = v_player_one_id
      AND player_one_locked_at IS NULL;

    UPDATE battles
    SET player_two_locked_at = NOW()
    WHERE id = p_battle_id
      AND p_profile_id = v_player_two_id
      AND player_two_locked_at IS NULL;

    RETURN v_prompt_id;
  END IF;

  IF v_battle_status NOT IN ('matched', 'waiting_for_prompts') THEN
    RAISE EXCEPTION 'Battle not ready for prompt submission';
  END IF;

  IF p_custom_prompt_text IS NOT NULL THEN
    v_word_count := array_length(regexp_split_to_array(trim(p_custom_prompt_text), '\s+'), 1);
  END IF;

  v_moderation_status := COALESCE(
    p_moderation_status,
    CASE
      WHEN p_prompt_template_id IS NOT NULL THEN 'approved'::moderation_status
      ELSE 'pending'::moderation_status
    END
  );

  INSERT INTO battle_prompts (
    battle_id,
    profile_id,
    round_number,
    prompt_template_id,
    custom_prompt_text,
    move_type,
    moderation_status,
    is_locked,
    locked_at,
    word_count
  )
  VALUES (
    p_battle_id,
    p_profile_id,
    v_round_number,
    p_prompt_template_id,
    p_custom_prompt_text,
    p_move_type,
    v_moderation_status,
    TRUE,
    NOW(),
    v_word_count
  )
  RETURNING id INTO v_prompt_id;

  -- Decide the new battle status. The "both locked" count is scoped to THIS
  -- round; for single format / round 1 this is identical to the previous
  -- all-rounds count, and for Bo3 rounds 2+ it no longer miscounts prior
  -- rounds' rows.
  IF v_is_bot_battle THEN
    v_new_status := 'resolving';
  ELSIF (
    SELECT COUNT(*) FROM battle_prompts
    WHERE battle_id = p_battle_id
      AND round_number = v_round_number
      AND is_locked = TRUE
  ) = 2 THEN
    v_new_status := 'resolving';
  ELSE
    v_new_status := 'waiting_for_prompts';
  END IF;

  -- Stamp the caller's per-side lock timestamp in the same UPDATE as the
  -- status transition (single Realtime event). Stamped for ALL formats;
  -- COALESCE keeps the first lock time for Bo3 rounds 2+.
  UPDATE battles SET
    status = v_new_status,
    player_one_locked_at = CASE
      WHEN p_profile_id = v_player_one_id
        THEN COALESCE(player_one_locked_at, NOW())
      ELSE player_one_locked_at
    END,
    player_two_locked_at = CASE
      WHEN p_profile_id = v_player_two_id
        THEN COALESCE(player_two_locked_at, NOW())
      ELSE player_two_locked_at
    END
  WHERE id = p_battle_id;

  ---------------------------------------------------------------------------
  -- Keep battle_rounds in sync for SINGLE-format only.
  -- Bo3 is owned by the submit-prompt Edge Function.
  ---------------------------------------------------------------------------
  IF v_format = 'single' THEN
    -- Ensure the round-1 row exists (covers battles created after the Bo3
    -- migration, which backfilled only pre-existing rows).
    INSERT INTO battle_rounds (
      battle_id, round_number, status, lock_in_deadline
    )
    SELECT
      b.id,
      1,
      'waiting_for_prompts'::round_status,
      COALESCE(b.player_one_prompt_deadline, b.player_two_prompt_deadline)
    FROM battles b
    WHERE b.id = p_battle_id
    ON CONFLICT (battle_id, round_number) DO NOTHING;

    -- When the battle has just moved to 'resolving' (both prompts locked or
    -- bot battle), stamp `both_locked_at` so the visibility-aware
    -- battle_prompts RLS policy reveals the opponent's prompt.
    IF v_new_status = 'resolving' THEN
      UPDATE battle_rounds
      SET both_locked_at = COALESCE(both_locked_at, NOW()),
          updated_at = NOW()
      WHERE battle_id = p_battle_id
        AND round_number = 1
        AND both_locked_at IS NULL;
    END IF;
  END IF;

  RETURN v_prompt_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Re-apply service-role-only ACLs (20260731122000) on the new signature.
-- SECURITY DEFINER + trusted p_profile_id: must not be client-callable.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status, INTEGER) TO service_role;
