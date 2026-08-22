-- Activate Best-of-3 for ALL battle-creation paths (ranked, unranked/casual,
-- friend challenge, and bot).
--
-- Bo3 shipped as a Phase-2 mode gated behind `battles.format` (default
-- 'single'), so the whole round-resolve / HP / battle_rounds pipeline was built
-- but never switched on: `create_battle` and `create_bot_battle` never set the
-- flag, so every battle resolved after round 1. This flips both creators to
-- `format='bo3'`, `best_of=3`. The matchmaking face-off writer (`startFaceOff`)
-- already runs after every finalization and initializes HP / stats snapshot /
-- round-1 row for bo3 battles — it was simply a no-op while battles were single.
--
-- Column default stays 'single' on purpose: only these two explicit creators
-- opt into bo3, so any future/legacy manual insert remains single unless it asks
-- otherwise. In-flight single-format battles are untouched and resolve as before.
--
-- Bodies are otherwise identical to 20260527120000_fix_create_battle_status_cast
-- (the ::battle_status casts are preserved). Idempotent via CREATE OR REPLACE.

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
    format,
    best_of,
    player_one_prompt_deadline
  )
  VALUES (
    p_player_one_id,
    p_character_id,
    p_friend_challenge_id,
    p_mode,
    (CASE WHEN p_friend_challenge_id IS NULL THEN 'created' ELSE 'matched' END)::battle_status,
    'bo3',
    3,
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
    format,
    best_of,
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
    'bo3',
    3,
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
