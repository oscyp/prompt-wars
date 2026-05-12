-- Seed starter content on hosted databases.
-- The CLI seed.sql file is only applied by local db reset, so production needs
-- this migration for bot matchmaking and first-run content.

INSERT INTO seasons (name, season_number, starts_at, ends_at, is_active, rewards_config)
SELECT
  'Founding Season',
  1,
  '2026-05-01 00:00:00+00'::TIMESTAMPTZ,
  '2026-08-01 00:00:00+00'::TIMESTAMPTZ,
  TRUE,
  '{"top_10_credits": 100, "top_100_credits": 50, "cosmetic_frame": "founding_champion"}'::JSONB
WHERE NOT EXISTS (
  SELECT 1 FROM seasons WHERE season_number = 1
);

INSERT INTO prompt_templates (title, body, category, difficulty, tags, suggested_move_type, is_ranked_safe)
SELECT
  v.title,
  v.body,
  v.category,
  v.difficulty,
  v.tags::TEXT[],
  v.suggested_move_type::move_type,
  TRUE
FROM (VALUES
  ('Swift Strike', 'A lightning-fast opening move that catches opponents off guard with pure speed and precision.', 'opening_attack', 'beginner', ARRAY['quick', 'direct'], 'attack'),
  ('Shadow Approach', 'Begin from the darkness, unseen and unheard, waiting for the perfect moment to reveal your presence.', 'opening_attack', 'intermediate', ARRAY['stealth', 'tactical'], 'attack'),
  ('Titan''s Challenge', 'Step forward with unshakable confidence, daring your opponent to match your power head-on.', 'opening_attack', 'beginner', ARRAY['bold', 'direct'], 'attack'),
  ('Adaptive Counter', 'Read your opponent''s intent and shift your stance to turn their strength into weakness.', 'defense_reversal', 'intermediate', ARRAY['reactive', 'tactical'], 'defense'),
  ('Iron Will', 'Stand firm against the storm, absorbing the impact and waiting for the right moment to respond.', 'defense_reversal', 'beginner', ARRAY['resilient', 'patient'], 'defense'),
  ('Redirect Flow', 'Gracefully guide the incoming force away, using your opponent''s momentum against them.', 'defense_reversal', 'advanced', ARRAY['elegant', 'tactical'], 'defense'),
  ('Crescendo', 'Build momentum through the battle until the final moment explodes with overwhelming force.', 'final_move', 'intermediate', ARRAY['dramatic', 'powerful'], 'finisher'),
  ('Checkmate Declaration', 'Calmly announce victory three moves before it happens, then execute flawlessly.', 'final_move', 'advanced', ARRAY['calculated', 'confident'], 'finisher'),
  ('Phoenix Rise', 'Emerge from apparent defeat with a move so unexpected it reverses the entire battle.', 'final_move', 'advanced', ARRAY['dramatic', 'unexpected'], 'finisher'),
  ('Underestimated Edge', 'Let them think you''re harmless, then show them exactly how wrong they were.', 'strategy', 'intermediate', ARRAY['clever', 'psychological'], 'attack'),
  ('Mirror Match', 'Copy your opponent''s style so perfectly they can''t tell whose move is whose.', 'strategy', 'advanced', ARRAY['mimicry', 'clever'], 'defense'),
  ('Chaotic Gambit', 'Throw logic out the window and do something so absurd it actually works.', 'chaos', 'beginner', ARRAY['unpredictable', 'fun'], 'attack'),
  ('Slow Motion Moment', 'Time seems to freeze as you execute a move so clean, so perfect, the world stops to watch.', 'cinematic_finisher', 'intermediate', ARRAY['dramatic', 'stylish'], 'finisher'),
  ('Against All Odds', 'The battlefield is chaos, the odds impossible, but somehow you find a way through.', 'cinematic_finisher', 'advanced', ARRAY['heroic', 'dramatic'], 'finisher')
) AS v(title, body, category, difficulty, tags, suggested_move_type)
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_templates pt WHERE pt.title = v.title
);

INSERT INTO bot_personas (name, archetype, battle_cry, signature_color, is_active, target_win_rate_week1)
SELECT
  v.name,
  v.archetype::archetype,
  v.battle_cry,
  v.signature_color,
  TRUE,
  0.45
FROM (VALUES
  ('Nova', 'strategist', 'Every move calculated.', '#3b82f6'),
  ('Whisper', 'trickster', 'Expect the unexpected.', '#a855f7'),
  ('Forge', 'titan', 'Strength speaks louder.', '#ef4444'),
  ('Echo', 'mystic', 'The unseen prevails.', '#8b5cf6'),
  ('Cipher', 'engineer', 'Precision is perfection.', '#10b981')
) AS v(name, archetype, battle_cry, signature_color)
WHERE NOT EXISTS (
  SELECT 1 FROM bot_personas bp WHERE bp.name = v.name
);

INSERT INTO bot_prompt_library (bot_persona_id, prompt_text, move_type, archetype_preference, theme_tags)
SELECT
  bp.id,
  v.prompt_text,
  v.move_type::move_type,
  v.archetype_preference::archetype,
  v.theme_tags::TEXT[]
FROM (VALUES
  ('Nova', 'Analyze the field, identify three weaknesses, exploit the most critical one with surgical precision.', 'attack', 'strategist', ARRAY['tactical', 'analytical']),
  ('Nova', 'Predict the opponent''s next two moves, position yourself to counter both, then wait patiently.', 'defense', 'strategist', ARRAY['defensive', 'predictive']),
  ('Whisper', 'Feint left, gesture right, but strike from below where no one is looking.', 'attack', 'trickster', ARRAY['deceptive', 'creative']),
  ('Whisper', 'Make them think they''ve won, then reveal it was all part of your plan from the start.', 'finisher', 'trickster', ARRAY['twist', 'clever']),
  ('Forge', 'No tricks, no games. Just overwhelming, unstoppable force meeting immovable will.', 'attack', 'titan', ARRAY['direct', 'powerful']),
  ('Forge', 'Endure the onslaught without flinching, then respond with double the intensity.', 'defense', 'titan', ARRAY['resilient', 'powerful']),
  ('Echo', 'Speak in riddles that only become clear when the battle is already won.', 'attack', 'mystic', ARRAY['abstract', 'poetic']),
  ('Echo', 'The answer was always there, hidden in plain sight, waiting for those wise enough to see.', 'finisher', 'mystic', ARRAY['revelatory', 'poetic']),
  ('Cipher', 'Execute subroutine alpha-seven: dismantle opponent strategy layer by layer, systematically.', 'attack', 'engineer', ARRAY['technical', 'methodical']),
  ('Cipher', 'Deploy countermeasure protocol: neutralize incoming threat with minimal energy expenditure.', 'defense', 'engineer', ARRAY['efficient', 'technical'])
) AS v(persona_name, prompt_text, move_type, archetype_preference, theme_tags)
JOIN bot_personas bp ON bp.name = v.persona_name
WHERE NOT EXISTS (
  SELECT 1
  FROM bot_prompt_library bpl
  WHERE bpl.bot_persona_id = bp.id
    AND bpl.prompt_text = v.prompt_text
);

INSERT INTO judge_calibration_sets (locale, prompt_one_text, prompt_one_move_type, prompt_two_text, prompt_two_move_type, expected_winner, theme, is_active)
SELECT
  v.locale,
  v.prompt_one_text,
  v.prompt_one_move_type::move_type,
  v.prompt_two_text,
  v.prompt_two_move_type::move_type,
  v.expected_winner,
  v.theme,
  TRUE
FROM (VALUES
  ('en', 'Weave through the shadows, appearing and disappearing like smoke, always three steps ahead of where they expect you to be.', 'attack', 'I attack.', 'attack', 1, 'stealth'),
  ('en', 'Stand firm like an ancient oak, roots deep, branches wide, weathering the storm until calm returns.', 'defense', 'Block the attack and counter.', 'defense', 1, 'resilience'),
  ('en', 'Strike with the precision of a master swordsmith, every movement deliberate, every angle calculated for maximum impact.', 'attack', 'Attack with unwavering focus, channeling years of training into a single, devastating motion.', 'attack', 1, 'precision')
) AS v(locale, prompt_one_text, prompt_one_move_type, prompt_two_text, prompt_two_move_type, expected_winner, theme)
WHERE NOT EXISTS (
  SELECT 1
  FROM judge_calibration_sets jcs
  WHERE jcs.locale = v.locale
    AND jcs.prompt_one_text = v.prompt_one_text
    AND jcs.prompt_two_text = v.prompt_two_text
);

INSERT INTO daily_quests (title, description, quest_type, target_value, reward_credits, reward_xp, active_date, is_active)
SELECT
  v.title,
  v.description,
  v.quest_type,
  v.target_value,
  v.reward_credits,
  v.reward_xp,
  CURRENT_DATE,
  TRUE
FROM (VALUES
  ('First Victory', 'Win your first battle today', 'win_battle', 1, 2, 50),
  ('Three Battles', 'Complete 3 battles', 'complete_battles', 3, 3, 100),
  ('Finisher Focus', 'Use a Finisher move type in a battle', 'use_finisher', 1, 1, 25)
) AS v(title, description, quest_type, target_value, reward_credits, reward_xp)
WHERE NOT EXISTS (
  SELECT 1
  FROM daily_quests dq
  WHERE dq.title = v.title
    AND dq.active_date = CURRENT_DATE
);

INSERT INTO daily_themes (theme_text, theme_date)
SELECT 'Overcome an impossible challenge', CURRENT_DATE
WHERE NOT EXISTS (
  SELECT 1 FROM daily_themes WHERE theme_date = CURRENT_DATE
);