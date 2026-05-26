-- Single-format `battle_rounds` writer: ensure round-1 row exists and write
-- `both_locked_at` when both prompts have locked in.
--
-- Context: the Bo3 migration (20260525120000) introduced
-- `battle_rounds.both_locked_at`, which the new visibility-aware RLS policy
-- on `battle_prompts` reads to determine when the opponent's prompt is
-- visible. The migration backfilled `both_locked_at` for already-resolved
-- battles, but no writer existed for *new* single-format battles, so their
-- opponent prompts would stay hidden indefinitely from the RLS point of
-- view. This patch fixes that without changing client-visible single-format
-- behavior.
--
-- Bo3 path is untouched: the submit-prompt Edge Function still owns the
-- per-round `battle_rounds` updates for Bo3. We guard all new writes here
-- on `format = 'single'`.
--
-- Idempotent: round-1 INSERT uses ON CONFLICT DO NOTHING; both_locked_at is
-- only set when currently NULL.

CREATE OR REPLACE FUNCTION lock_prompt(
  p_battle_id UUID,
  p_profile_id UUID,
  p_prompt_template_id UUID DEFAULT NULL,
  p_custom_prompt_text TEXT DEFAULT NULL,
  p_move_type move_type DEFAULT 'attack',
  p_moderation_status moderation_status DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_prompt_id UUID;
  v_battle_status battle_status;
  v_word_count INTEGER;
  v_is_bot_battle BOOLEAN;
  v_moderation_status moderation_status;
  v_format battle_format;
  v_new_status battle_status;
BEGIN
  SELECT status, is_player_two_bot, format
    INTO v_battle_status, v_is_bot_battle, v_format
  FROM battles WHERE id = p_battle_id;

  IF v_battle_status IS NULL THEN
    RAISE EXCEPTION 'Battle not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM battles
    WHERE id = p_battle_id
      AND (player_one_id = p_profile_id OR player_two_id = p_profile_id)
  ) THEN
    RAISE EXCEPTION 'Player not in this battle';
  END IF;

  -- Idempotent return for retries on the same (battle, player).
  -- NOTE: this returns the FIRST prompt for the (battle, player) regardless
  -- of round number. For Bo3, callers must pass a fresh battle context per
  -- round; the per-round uniqueness constraint
  -- (battle_id, profile_id, round_number) prevents collision on INSERT below.
  SELECT id INTO v_prompt_id
  FROM battle_prompts
  WHERE battle_id = p_battle_id AND profile_id = p_profile_id;

  IF v_prompt_id IS NOT NULL THEN
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
    p_prompt_template_id,
    p_custom_prompt_text,
    p_move_type,
    v_moderation_status,
    TRUE,
    NOW(),
    v_word_count
  )
  RETURNING id INTO v_prompt_id;

  -- Decide the new battle status (unchanged from prior implementation).
  IF v_is_bot_battle THEN
    v_new_status := 'resolving';
  ELSIF (
    SELECT COUNT(*) FROM battle_prompts
    WHERE battle_id = p_battle_id AND is_locked = TRUE
  ) = 2 THEN
    v_new_status := 'resolving';
  ELSE
    v_new_status := 'waiting_for_prompts';
  END IF;

  UPDATE battles SET status = v_new_status WHERE id = p_battle_id;

  ---------------------------------------------------------------------------
  -- NEW: keep battle_rounds in sync for SINGLE-format only.
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
