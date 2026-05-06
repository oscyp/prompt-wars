-- Prompt Wars Seed Data
-- Phase 1+: Starter content for MVP gameplay

--------------------------------------------------------------------------------
-- INITIAL SEASON
--------------------------------------------------------------------------------

INSERT INTO seasons (name, season_number, starts_at, ends_at, is_active, rewards_config)
VALUES (
  'Founding Season',
  1,
  '2026-05-01 00:00:00+00',
  '2026-08-01 00:00:00+00',
  TRUE,
  '{"top_10_credits": 100, "top_100_credits": 50, "cosmetic_frame": "founding_champion"}'
);

--------------------------------------------------------------------------------
-- PROMPT TEMPLATES (Curated, safe for ranked play)
--------------------------------------------------------------------------------

-- Opening attacks
INSERT INTO prompt_templates (title, body, category, difficulty, tags, suggested_move_type, is_ranked_safe)
VALUES
  ('Swift Strike', 'A lightning-fast opening move that catches opponents off guard with pure speed and precision.', 'opening_attack', 'beginner', '{"quick", "direct"}', 'attack', TRUE),
  ('Shadow Approach', 'Begin from the darkness, unseen and unheard, waiting for the perfect moment to reveal your presence.', 'opening_attack', 'intermediate', '{"stealth", "tactical"}', 'attack', TRUE),
  ('Titan''s Challenge', 'Step forward with unshakable confidence, daring your opponent to match your power head-on.', 'opening_attack', 'beginner', '{"bold", "direct"}', 'attack', TRUE);

-- Defense moves
INSERT INTO prompt_templates (title, body, category, difficulty, tags, suggested_move_type, is_ranked_safe)
VALUES
  ('Adaptive Counter', 'Read your opponent''s intent and shift your stance to turn their strength into weakness.', 'defense_reversal', 'intermediate', '{"reactive", "tactical"}', 'defense', TRUE),
  ('Iron Will', 'Stand firm against the storm, absorbing the impact and waiting for the right moment to respond.', 'defense_reversal', 'beginner', '{"resilient", "patient"}', 'defense', TRUE),
  ('Redirect Flow', 'Gracefully guide the incoming force away, using your opponent''s momentum against them.', 'defense_reversal', 'advanced', '{"elegant", "tactical"}', 'defense', TRUE);

-- Finishers
INSERT INTO prompt_templates (title, body, category, difficulty, tags, suggested_move_type, is_ranked_safe)
VALUES
  ('Crescendo', 'Build momentum through the battle until the final moment explodes with overwhelming force.', 'final_move', 'intermediate', '{"dramatic", "powerful"}', 'finisher', TRUE),
  ('Checkmate Declaration', 'Calmly announce victory three moves before it happens, then execute flawlessly.', 'final_move', 'advanced', '{"calculated", "confident"}', 'finisher', TRUE),
  ('Phoenix Rise', 'Emerge from apparent defeat with a move so unexpected it reverses the entire battle.', 'final_move', 'advanced', '{"dramatic", "unexpected"}', 'finisher', TRUE);

-- Taunts and Strategy
INSERT INTO prompt_templates (title, body, category, difficulty, tags, suggested_move_type, is_ranked_safe)
VALUES
  ('Underestimated Edge', 'Let them think you''re harmless, then show them exactly how wrong they were.', 'strategy', 'intermediate', '{"clever", "psychological"}', 'attack', TRUE),
  ('Mirror Match', 'Copy your opponent''s style so perfectly they can''t tell whose move is whose.', 'strategy', 'advanced', '{"mimicry", "clever"}', 'defense', TRUE),
  ('Chaotic Gambit', 'Throw logic out the window and do something so absurd it actually works.', 'chaos', 'beginner', '{"unpredictable", "fun"}', 'attack', TRUE);

-- Cinematic
INSERT INTO prompt_templates (title, body, category, difficulty, tags, suggested_move_type, is_ranked_safe)
VALUES
  ('Slow Motion Moment', 'Time seems to freeze as you execute a move so clean, so perfect, the world stops to watch.', 'cinematic_finisher', 'intermediate', '{"dramatic", "stylish"}', 'finisher', TRUE),
  ('Against All Odds', 'The battlefield is chaos, the odds impossible, but somehow you find a way through.', 'cinematic_finisher', 'advanced', '{"heroic", "dramatic"}', 'finisher', TRUE);

--------------------------------------------------------------------------------
-- BOT PERSONAS (Server-only, not visible to players directly)
--------------------------------------------------------------------------------

INSERT INTO bot_personas (name, archetype, battle_cry, signature_color, is_active, target_win_rate_week1)
VALUES
  ('Nova', 'strategist', 'Every move calculated.', '#3b82f6', TRUE, 0.45),
  ('Whisper', 'trickster', 'Expect the unexpected.', '#a855f7', TRUE, 0.45),
  ('Forge', 'titan', 'Strength speaks louder.', '#ef4444', TRUE, 0.45),
  ('Echo', 'mystic', 'The unseen prevails.', '#8b5cf6', TRUE, 0.45),
  ('Cipher', 'engineer', 'Precision is perfection.', '#10b981', TRUE, 0.45);

--------------------------------------------------------------------------------
-- BOT PROMPT LIBRARY (Separate from human templates)
--------------------------------------------------------------------------------

-- Nova (Strategist) prompts
INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Analyze the field, identify three weaknesses, exploit the most critical one with surgical precision.',
  'attack',
  'strategist',
  '{"tactical", "analytical"}'
FROM bot_personas WHERE name = 'Nova';

INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Predict the opponent''s next two moves, position yourself to counter both, then wait patiently.',
  'defense',
  'strategist',
  '{"defensive", "predictive"}'
FROM bot_personas WHERE name = 'Nova';

-- Whisper (Trickster) prompts
INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Feint left, gesture right, but strike from below where no one is looking.',
  'attack',
  'trickster',
  '{"deceptive", "creative"}'
FROM bot_personas WHERE name = 'Whisper';

INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Make them think they''ve won, then reveal it was all part of your plan from the start.',
  'finisher',
  'trickster',
  '{"twist", "clever"}'
FROM bot_personas WHERE name = 'Whisper';

-- Forge (Titan) prompts
INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'No tricks, no games. Just overwhelming, unstoppable force meeting immovable will.',
  'attack',
  'titan',
  '{"direct", "powerful"}'
FROM bot_personas WHERE name = 'Forge';

INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Endure the onslaught without flinching, then respond with double the intensity.',
  'defense',
  'titan',
  '{"resilient", "powerful"}'
FROM bot_personas WHERE name = 'Forge';

-- Echo (Mystic) prompts
INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Speak in riddles that only become clear when the battle is already won.',
  'attack',
  'mystic',
  '{"abstract", "poetic"}'
FROM bot_personas WHERE name = 'Echo';

INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'The answer was always there, hidden in plain sight, waiting for those wise enough to see.',
  'finisher',
  'mystic',
  '{"revelatory", "poetic"}'
FROM bot_personas WHERE name = 'Echo';

-- Cipher (Engineer) prompts
INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Execute subroutine alpha-seven: dismantle opponent strategy layer by layer, systematically.',
  'attack',
  'engineer',
  '{"technical", "methodical"}'
FROM bot_personas WHERE name = 'Cipher';

INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT 
  id,
  'Deploy countermeasure protocol: neutralize incoming threat with minimal energy expenditure.',
  'defense',
  'engineer',
  '{"efficient", "technical"}'
FROM bot_personas WHERE name = 'Cipher';

--------------------------------------------------------------------------------
-- JUDGE CALIBRATION SET (Ground truth for nightly accuracy checks)
--------------------------------------------------------------------------------

-- High-quality vs low-quality (clear winner)
INSERT INTO judge_calibration_sets (locale, prompt_one_text, prompt_one_move_type, prompt_two_text, prompt_two_move_type, expected_winner, theme, is_active)
VALUES
  (
    'en',
    'Weave through the shadows, appearing and disappearing like smoke, always three steps ahead of where they expect you to be.',
    'attack',
    'I attack.',
    'attack',
    1,
    'stealth',
    TRUE
  ),
  (
    'en',
    'Stand firm like an ancient oak, roots deep, branches wide, weathering the storm until calm returns.',
    'defense',
    'Block the attack and counter.',
    'defense',
    1,
    'resilience',
    TRUE
  );

-- Similar quality (draw expected)
INSERT INTO judge_calibration_sets (locale, prompt_one_text, prompt_one_move_type, prompt_two_text, prompt_two_move_type, expected_winner, theme, is_active)
VALUES
  (
    'en',
    'Strike with the precision of a master swordsmith, every movement deliberate, every angle calculated for maximum impact.',
    'attack',
    'Attack with unwavering focus, channeling years of training into a single, devastating motion.',
    'attack',
    1, -- Slight edge to first for specificity, but could be draw
    'precision',
    TRUE
  );

--------------------------------------------------------------------------------
-- DAILY QUESTS (Sample set)
--------------------------------------------------------------------------------

-- Week 1 daily quests
INSERT INTO daily_quests (title, description, quest_type, target_value, reward_credits, reward_xp, active_date, is_active)
VALUES
  ('First Victory', 'Win your first battle today', 'win_battle', 1, 2, 50, CURRENT_DATE, TRUE),
  ('Three Battles', 'Complete 3 battles', 'complete_battles', 3, 3, 100, CURRENT_DATE, TRUE),
  ('Finisher Focus', 'Use a Finisher move type in a battle', 'use_finisher', 1, 1, 25, CURRENT_DATE, TRUE);

--------------------------------------------------------------------------------
-- DAILY THEME (Today's theme)
--------------------------------------------------------------------------------

INSERT INTO daily_themes (theme_text, theme_date)
VALUES
  ('Overcome an impossible challenge', CURRENT_DATE);

--------------------------------------------------------------------------------
-- DEFAULT NOTIFICATION PREFERENCES (Applied on profile creation)
--------------------------------------------------------------------------------

-- This will be inserted via trigger or Edge Function on profile creation
-- Keeping as reference for Edge Function implementation
