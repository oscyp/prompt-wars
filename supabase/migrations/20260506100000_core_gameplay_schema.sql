-- Prompt Wars Phase 1+ Core Gameplay Schema
-- Implements MVP data model from docs/prompt-wars-implementation-concept.md
-- Covers: profiles, characters, battles, prompts, judge, appeals, rivals, video pipeline

--------------------------------------------------------------------------------
-- ENUMS AND TYPES
--------------------------------------------------------------------------------

-- Battle lifecycle states
CREATE TYPE battle_status AS ENUM (
  'created',
  'matched',
  'waiting_for_prompts',
  'resolving',
  'result_ready',
  'generating_video',
  'completed',
  'expired',
  'canceled',
  'moderation_failed',
  'generation_failed'
);

-- Battle modes
CREATE TYPE battle_mode AS ENUM (
  'ranked',
  'unranked',
  'friend_challenge',
  'daily_theme',
  'bot'
);

-- Move types (rock-paper-scissors layer)
CREATE TYPE move_type AS ENUM (
  'attack',
  'defense',
  'finisher'
);

-- Prompt moderation states
CREATE TYPE moderation_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'flagged_human_review'
);

-- Video job states
CREATE TYPE video_job_status AS ENUM (
  'queued',
  'submitted',
  'processing',
  'succeeded',
  'failed'
);

-- Appeal states
CREATE TYPE appeal_status AS ENUM (
  'pending',
  'resolved_upheld',
  'resolved_overturned',
  'ineligible'
);

-- Currency types for wallet
CREATE TYPE currency_type AS ENUM (
  'credits',
  'xp'
);

-- Character archetypes (free, never paywalled)
CREATE TYPE archetype AS ENUM (
  'strategist',
  'trickster',
  'titan',
  'mystic',
  'engineer'
);

--------------------------------------------------------------------------------
-- CORE TABLES
--------------------------------------------------------------------------------

-- Player profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL CHECK (char_length(username) >= 3 AND char_length(username) <= 20),
  display_name TEXT NOT NULL CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 40),
  avatar_url TEXT,
  
  -- Glicko-2 rating fields
  rating NUMERIC(8, 2) NOT NULL DEFAULT 1500.00,
  rating_deviation NUMERIC(8, 2) NOT NULL DEFAULT 350.00,
  rating_volatility NUMERIC(6, 4) NOT NULL DEFAULT 0.0600,
  last_rated_at TIMESTAMPTZ,
  
  -- Stats
  total_battles INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  
  -- Daily/social
  daily_login_streak INTEGER NOT NULL DEFAULT 0,
  daily_login_last_date DATE,
  daily_login_mercy_used_this_week BOOLEAN NOT NULL DEFAULT FALSE,
  rival_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Onboarding
  onboarding_completed_at TIMESTAMPTZ,
  first_battle_completed_at TIMESTAMPTZ,
  
  -- Free video grants tracking
  free_tier1_reveals_remaining INTEGER NOT NULL DEFAULT 3,
  free_tier1_reveals_granted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Characters (players can have multiple, one active per battle)
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 40),
  archetype archetype NOT NULL,
  style_description TEXT CHECK (char_length(style_description) <= 200),
  battle_cry TEXT NOT NULL CHECK (char_length(battle_cry) >= 1 AND char_length(battle_cry) <= 60),
  signature_color TEXT NOT NULL DEFAULT '#6366f1', -- hex color
  avatar_asset_url TEXT,
  cosmetic_config JSONB NOT NULL DEFAULT '{}',
  level INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_active_character_per_profile UNIQUE (profile_id, is_active) 
    WHERE (is_active = TRUE)
);

-- Prompt templates (curated safe prompts)
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) >= 20 AND char_length(body) <= 800),
  category TEXT NOT NULL, -- opening_attack, defense_reversal, final_move, taunt, etc.
  difficulty TEXT, -- beginner, intermediate, advanced
  tags TEXT[] NOT NULL DEFAULT '{}',
  suggested_move_type move_type,
  is_ranked_safe BOOLEAN NOT NULL DEFAULT TRUE,
  active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_until TIMESTAMPTZ,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bot personas (server-only prompt library for bot opponents)
CREATE TABLE bot_personas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  archetype archetype NOT NULL,
  avatar_url TEXT,
  battle_cry TEXT NOT NULL,
  signature_color TEXT NOT NULL DEFAULT '#94a3b8',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  target_win_rate_week1 NUMERIC(3, 2) NOT NULL DEFAULT 0.45, -- bots lose 55% in week 1
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bot prompt library (separate from human templates, not memorizable)
CREATE TABLE bot_prompt_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_persona_id UUID NOT NULL REFERENCES bot_personas(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL CHECK (char_length(prompt_text) >= 20 AND char_length(prompt_text) <= 800),
  move_type move_type NOT NULL,
  archetype_preference archetype,
  theme_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Battles (core gameplay state)
CREATE TABLE battles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mode battle_mode NOT NULL,
  status battle_status NOT NULL DEFAULT 'created',
  
  -- Players and characters
  player_one_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_two_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL until matched
  player_one_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  player_two_character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  is_player_two_bot BOOLEAN NOT NULL DEFAULT FALSE,
  bot_persona_id UUID REFERENCES bot_personas(id) ON DELETE SET NULL,
  
  -- Battle context
  theme TEXT, -- revealed after matchmaking, before prompt entry
  theme_revealed_at TIMESTAMPTZ,
  season_id UUID, -- FK to seasons table added in next migration
  
  -- Timeouts
  player_one_prompt_deadline TIMESTAMPTZ,
  player_two_prompt_deadline TIMESTAMPTZ,
  
  -- Resolution
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = draw
  is_draw BOOLEAN NOT NULL DEFAULT FALSE,
  score_payload JSONB, -- per-category scores, normalized scores, move matchup result
  rating_delta_payload JSONB, -- Glicko-2 deltas for both players
  
  -- Judge metadata
  judge_prompt_version TEXT, -- frozen version identifier for reproducibility
  judge_model_id TEXT,
  judge_seed INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT different_players CHECK (
    player_one_id != player_two_id OR is_player_two_bot = TRUE
  ),
  CONSTRAINT winner_is_participant CHECK (
    winner_id IS NULL OR winner_id IN (player_one_id, player_two_id)
  ),
  CONSTRAINT draw_xor_winner CHECK (
    (is_draw = TRUE AND winner_id IS NULL) OR (is_draw = FALSE)
  )
);

-- Battle prompts (immutable after lock)
CREATE TABLE battle_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Prompt content
  prompt_template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,
  custom_prompt_text TEXT CHECK (
    custom_prompt_text IS NULL OR 
    (char_length(custom_prompt_text) >= 20 AND char_length(custom_prompt_text) <= 800)
  ),
  move_type move_type NOT NULL,
  
  -- Moderation
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  moderation_reason TEXT,
  
  -- Lock and audit
  locked_at TIMESTAMPTZ,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  word_count INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_prompt_per_player_per_battle UNIQUE (battle_id, profile_id),
  CONSTRAINT prompt_has_content CHECK (
    prompt_template_id IS NOT NULL OR custom_prompt_text IS NOT NULL
  ),
  CONSTRAINT locked_prompts_immutable CHECK (
    is_locked = FALSE OR locked_at IS NOT NULL
  )
);

-- Judge runs (one or more per battle for scoring)
CREATE TABLE judge_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  
  -- Judge metadata
  judge_prompt_version TEXT NOT NULL,
  model_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  
  -- Scores
  player_one_raw_scores JSONB NOT NULL, -- {clarity: 8, originality: 7, ...}
  player_two_raw_scores JSONB NOT NULL,
  player_one_normalized_scores JSONB NOT NULL, -- length-normalized
  player_two_normalized_scores JSONB NOT NULL,
  
  -- Result
  winner_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL = draw
  is_draw BOOLEAN NOT NULL DEFAULT FALSE,
  explanation TEXT, -- judge's "why" text
  aggregate_score_diff NUMERIC(6, 2), -- normalized difference
  
  -- Run metadata
  is_tiebreaker BOOLEAN NOT NULL DEFAULT FALSE,
  is_appeal BOOLEAN NOT NULL DEFAULT FALSE,
  run_sequence INTEGER NOT NULL DEFAULT 1, -- 1 = first run, 2 = second, 3 = tiebreaker
  
  -- Provider tracking
  provider_request_id TEXT,
  latency_ms INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Appeals (capped 1/day on ranked losses)
CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  status appeal_status NOT NULL DEFAULT 'pending',
  
  -- Original result
  original_winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Appeal result
  appeal_judge_run_id UUID REFERENCES judge_runs(id) ON DELETE SET NULL,
  appeal_winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Outcome
  rating_reverted BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  
  CONSTRAINT only_loser_appeals CHECK (
    profile_id != original_winner_id OR original_winner_id IS NULL
  )
);

-- Judge calibration sets (frozen ground truth for nightly accuracy checks)
CREATE TABLE judge_calibration_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  locale TEXT NOT NULL DEFAULT 'en',
  prompt_one_text TEXT NOT NULL,
  prompt_one_move_type move_type NOT NULL,
  prompt_two_text TEXT NOT NULL,
  prompt_two_move_type move_type NOT NULL,
  expected_winner INTEGER NOT NULL CHECK (expected_winner IN (1, 2)), -- 1 or 2
  theme TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rivals (auto-tagged most-played opponent)
CREATE TABLE rivals (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rival_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  battles_count_30d INTEGER NOT NULL DEFAULT 0,
  last_battle_at TIMESTAMPTZ NOT NULL,
  is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  
  PRIMARY KEY (profile_id, rival_profile_id),
  CONSTRAINT not_self_rival CHECK (profile_id != rival_profile_id)
);

-- Prompt journal (personal best-rated prompts)
CREATE TABLE prompt_journal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  battle_prompt_id UUID NOT NULL REFERENCES battle_prompts(id) ON DELETE CASCADE,
  normalized_score NUMERIC(5, 2) NOT NULL,
  category TEXT NOT NULL, -- from rubric category where this was highest
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_journal_entry_per_prompt UNIQUE (profile_id, battle_prompt_id)
);

--------------------------------------------------------------------------------
-- INDEXES FOR COMMON QUERIES
--------------------------------------------------------------------------------

-- Profiles
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_rating ON profiles(rating DESC NULLS LAST);
CREATE INDEX idx_profiles_rival ON profiles(rival_profile_id) WHERE rival_profile_id IS NOT NULL;

-- Characters
CREATE INDEX idx_characters_profile_active ON characters(profile_id, is_active);

-- Battles
CREATE INDEX idx_battles_status ON battles(status);
CREATE INDEX idx_battles_player_one ON battles(player_one_id, created_at DESC);
CREATE INDEX idx_battles_player_two ON battles(player_two_id, created_at DESC) WHERE player_two_id IS NOT NULL;
CREATE INDEX idx_battles_mode_status ON battles(mode, status);
CREATE INDEX idx_battles_created_for_matchmaking ON battles(created_at) WHERE status = 'created';
CREATE INDEX idx_battles_expired_check ON battles(status, player_one_prompt_deadline, player_two_prompt_deadline)
  WHERE status = 'waiting_for_prompts';

-- Battle prompts
CREATE INDEX idx_battle_prompts_battle ON battle_prompts(battle_id);
CREATE INDEX idx_battle_prompts_profile ON battle_prompts(profile_id);
CREATE INDEX idx_battle_prompts_moderation ON battle_prompts(moderation_status) WHERE moderation_status = 'pending';

-- Judge runs
CREATE INDEX idx_judge_runs_battle ON judge_runs(battle_id);

-- Appeals
CREATE INDEX idx_appeals_profile_created ON appeals(profile_id, created_at DESC);
CREATE INDEX idx_appeals_pending ON appeals(status) WHERE status = 'pending';

-- Rivals
CREATE INDEX idx_rivals_profile ON rivals(profile_id, battles_count_30d DESC);

-- Prompt journal
CREATE INDEX idx_prompt_journal_profile ON prompt_journal(profile_id, normalized_score DESC);

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--------------------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_prompt_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_calibration_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_journal ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read own + public leaderboard, update own
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (
  id = auth.uid() OR 
  rating IS NOT NULL -- public leaderboard profiles
);

CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (
  id = auth.uid()
);

-- Characters: users can CRUD own characters
CREATE POLICY characters_select_own ON characters FOR SELECT USING (
  profile_id = auth.uid()
);

CREATE POLICY characters_insert_own ON characters FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);

CREATE POLICY characters_update_own ON characters FOR UPDATE USING (
  profile_id = auth.uid()
);

CREATE POLICY characters_delete_own ON characters FOR DELETE USING (
  profile_id = auth.uid()
);

-- Prompt templates: all users can read active templates
CREATE POLICY prompt_templates_select_all ON prompt_templates FOR SELECT USING (
  is_ranked_safe = TRUE AND 
  active_from <= NOW() AND 
  (active_until IS NULL OR active_until > NOW())
);

-- Bot personas: no direct client access
CREATE POLICY bot_personas_no_client_access ON bot_personas FOR SELECT USING (FALSE);
CREATE POLICY bot_prompt_library_no_client_access ON bot_prompt_library FOR SELECT USING (FALSE);

-- Battles: users can read battles they participate in
CREATE POLICY battles_select_participant ON battles FOR SELECT USING (
  player_one_id = auth.uid() OR player_two_id = auth.uid()
);

-- Battle prompts: users can read/insert prompts for their own battles
CREATE POLICY battle_prompts_select_own_battles ON battle_prompts FOR SELECT USING (
  profile_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM battles 
    WHERE battles.id = battle_prompts.battle_id 
      AND (battles.player_one_id = auth.uid() OR battles.player_two_id = auth.uid())
  )
);

CREATE POLICY battle_prompts_insert_own ON battle_prompts FOR INSERT WITH CHECK (
  profile_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM battles 
    WHERE battles.id = battle_id 
      AND (battles.player_one_id = auth.uid() OR battles.player_two_id = auth.uid())
      AND battles.status = 'waiting_for_prompts'
  )
);

-- Judge runs: users can read runs for their battles
CREATE POLICY judge_runs_select_own_battles ON judge_runs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM battles 
    WHERE battles.id = judge_runs.battle_id 
      AND (battles.player_one_id = auth.uid() OR battles.player_two_id = auth.uid())
  )
);

-- Appeals: users can read/create own appeals
CREATE POLICY appeals_select_own ON appeals FOR SELECT USING (
  profile_id = auth.uid()
);

CREATE POLICY appeals_insert_own ON appeals FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);

-- Calibration sets: no direct client access
CREATE POLICY judge_calibration_sets_no_client_access ON judge_calibration_sets FOR SELECT USING (FALSE);

-- Rivals: users can read own rivals
CREATE POLICY rivals_select_own ON rivals FOR SELECT USING (
  profile_id = auth.uid()
);

-- Prompt journal: users can read own journal
CREATE POLICY prompt_journal_select_own ON prompt_journal FOR SELECT USING (
  profile_id = auth.uid()
);

--------------------------------------------------------------------------------
-- REALTIME PUBLICATION
--------------------------------------------------------------------------------

-- Enable Realtime for battle state updates
ALTER PUBLICATION supabase_realtime ADD TABLE battles;
ALTER PUBLICATION supabase_realtime ADD TABLE battle_prompts;

--------------------------------------------------------------------------------
-- TRIGGERS FOR UPDATED_AT
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER characters_updated_at BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER battles_updated_at BEFORE UPDATE ON battles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
