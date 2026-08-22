-- =============================================================================
-- Per-side lock timestamps on `battles` (opponent-locked signal)
-- =============================================================================
-- Single-format battles have no client-readable "opponent has locked in"
-- signal: `battle_prompts` RLS intentionally hides the opponent's row until
-- both players lock (visibility-aware policy keyed on
-- `battle_rounds.both_locked_at`), and the Bo3-only
-- `battle_rounds.player_one_locked_at` / `player_two_locked_at` columns are
-- not written for single-format round 1 by `lock_prompt`.
--
-- This migration adds content-free, per-side lock timestamps directly on
-- `battles` and teaches `lock_prompt` to stamp them for ALL formats (harmless
-- redundancy for Bo3 round 1, uniform read path for the client).
--
-- Leak analysis: the columns carry TIMESTAMPS ONLY — no move type, no prompt
-- content, no template id. `battles` is already in the `supabase_realtime`
-- publication (20260506100000) and the participant SELECT policy
-- (`battles_select_participant`) is row-scoped with no column restriction, so
-- both participants can read/subscribe to the new columns with no policy
-- change.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE of the existing
-- 6-arg `lock_prompt` signature (the 5-arg overload was dropped in
-- 20260623130000; latest body is 20260525130000); backfill only touches NULLs.
-- =============================================================================

ALTER TABLE battles ADD COLUMN IF NOT EXISTS player_one_locked_at TIMESTAMPTZ;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS player_two_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN battles.player_one_locked_at IS
  'When player one locked their prompt (first lock for Bo3). Content-free opponent-locked signal; timestamps only.';
COMMENT ON COLUMN battles.player_two_locked_at IS
  'When player two locked their prompt (first lock for Bo3). Content-free opponent-locked signal; timestamps only.';

-- -----------------------------------------------------------------------------
-- lock_prompt: replicate the latest definition (20260525130000) and stamp the
-- caller's side on `battles` when their prompt locks.
-- -----------------------------------------------------------------------------
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
  v_player_one_id UUID;
  v_player_two_id UUID;
BEGIN
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

  -- Idempotent return for retries on the same (battle, player).
  -- NOTE: this returns the FIRST prompt for the (battle, player) regardless
  -- of round number. For Bo3, callers must pass a fresh battle context per
  -- round; the per-round uniqueness constraint
  -- (battle_id, profile_id, round_number) prevents collision on INSERT below.
  SELECT id INTO v_prompt_id
  FROM battle_prompts
  WHERE battle_id = p_battle_id AND profile_id = p_profile_id;

  IF v_prompt_id IS NOT NULL THEN
    -- Retry path: make sure the per-side lock stamp exists (older battles or
    -- rows locked before this migration). Only fires when currently NULL, so
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

  -- NEW: stamp the caller's per-side lock timestamp in the same UPDATE as the
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- Backfill: derive per-side stamps for existing battles from the earliest
-- locked prompt per (battle, player). Only touches NULLs → idempotent.
-- -----------------------------------------------------------------------------
UPDATE battles b
SET player_one_locked_at = sub.first_locked_at
FROM (
  SELECT battle_id, profile_id, MIN(locked_at) AS first_locked_at
  FROM battle_prompts
  WHERE is_locked = TRUE AND locked_at IS NOT NULL
  GROUP BY battle_id, profile_id
) sub
WHERE sub.battle_id = b.id
  AND sub.profile_id = b.player_one_id
  AND b.player_one_locked_at IS NULL;

UPDATE battles b
SET player_two_locked_at = sub.first_locked_at
FROM (
  SELECT battle_id, profile_id, MIN(locked_at) AS first_locked_at
  FROM battle_prompts
  WHERE is_locked = TRUE AND locked_at IS NOT NULL
  GROUP BY battle_id, profile_id
) sub
WHERE sub.battle_id = b.id
  AND sub.profile_id = b.player_two_id
  AND b.player_two_locked_at IS NULL;
