-- Fix create_battle: the CASE expression yields text and Postgres refuses to
-- implicitly cast text -> battle_status. Without this cast, every INSERT in
-- create_battle fails with:
--   ERROR: column "status" is of type battle_status but expression is of type text
--
-- Same fix applied to create_bot_battle for the 'matched' literal, for safety.

CREATE OR REPLACE FUNCTION create_battle(
  p_player_one_id UUID,
  p_character_id UUID,
  p_mode battle_mode DEFAULT 'ranked',
  p_friend_challenge_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_battle_id UUID;
  v_timeout_hours INTEGER;
BEGIN
  v_timeout_hours := CASE
    WHEN p_mode = 'ranked' THEN 2
    WHEN p_mode IN ('friend_challenge', 'unranked') THEN 8
    ELSE 2
  END;

  INSERT INTO battles (
    player_one_id,
    player_one_character_id,
    player_two_id,
    mode,
    status,
    player_one_prompt_deadline
  )
  VALUES (
    p_player_one_id,
    p_character_id,
    p_friend_challenge_id,
    p_mode,
    (CASE WHEN p_friend_challenge_id IS NULL THEN 'created' ELSE 'matched' END)::battle_status,
    NOW() + (v_timeout_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_battle_id;

  RETURN v_battle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION create_bot_battle(
  p_player_one_id UUID,
  p_character_id UUID,
  p_bot_persona_id UUID,
  p_mode battle_mode DEFAULT 'bot',
  p_theme TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_battle_id UUID;
  v_timeout_hours INTEGER;
BEGIN
  v_timeout_hours := CASE
    WHEN p_mode = 'ranked' THEN 2
    WHEN p_mode IN ('friend_challenge', 'unranked', 'bot') THEN 8
    ELSE 2
  END;

  INSERT INTO battles (
    player_one_id,
    player_one_character_id,
    player_two_id,
    player_two_character_id,
    is_player_two_bot,
    bot_persona_id,
    mode,
    status,
    theme,
    theme_revealed_at,
    matched_at,
    player_one_prompt_deadline,
    player_two_prompt_deadline
  )
  VALUES (
    p_player_one_id,
    p_character_id,
    NULL,
    NULL,
    TRUE,
    p_bot_persona_id,
    p_mode,
    'matched'::battle_status,
    p_theme,
    NOW(),
    NOW(),
    NOW() + (v_timeout_hours || ' hours')::INTERVAL,
    NULL -- Bot doesn't need a deadline
  )
  RETURNING id INTO v_battle_id;

  RETURN v_battle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
