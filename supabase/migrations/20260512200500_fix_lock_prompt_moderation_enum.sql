-- Fix enum typing in prompt submission.
-- Postgres does not implicitly cast text CASE expressions to moderation_status.

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
BEGIN
  SELECT status, is_player_two_bot INTO v_battle_status, v_is_bot_battle
  FROM battles WHERE id = p_battle_id;

  IF v_battle_status NOT IN ('matched', 'waiting_for_prompts') THEN
    RAISE EXCEPTION 'Battle not ready for prompt submission';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM battles
    WHERE id = p_battle_id
      AND (player_one_id = p_profile_id OR player_two_id = p_profile_id)
  ) THEN
    RAISE EXCEPTION 'Player not in this battle';
  END IF;

  IF EXISTS (
    SELECT 1 FROM battle_prompts
    WHERE battle_id = p_battle_id AND profile_id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'Prompt already submitted for this battle';
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

  IF v_is_bot_battle THEN
    UPDATE battles SET status = 'resolving' WHERE id = p_battle_id;
  ELSIF (SELECT COUNT(*) FROM battle_prompts WHERE battle_id = p_battle_id AND is_locked = TRUE) = 2 THEN
    UPDATE battles SET status = 'resolving' WHERE id = p_battle_id;
  ELSE
    UPDATE battles SET status = 'waiting_for_prompts' WHERE id = p_battle_id;
  END IF;

  RETURN v_prompt_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;