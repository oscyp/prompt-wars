-- Prompt Wars Phase 1+ Economy, Video Pipeline, Social, and Rankings Schema
-- Implements monetization, video jobs, seasons, rankings, moderation

--------------------------------------------------------------------------------
-- VIDEO PIPELINE TABLES
--------------------------------------------------------------------------------

-- Video generation jobs (async provider pipeline)
CREATE TABLE video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL UNIQUE REFERENCES battles(id) ON DELETE CASCADE,
  
  -- Provider tracking
  provider TEXT NOT NULL DEFAULT 'xai', -- xai | mock
  provider_job_id TEXT,
  provider_request_id TEXT,
  
  -- Job state
  status video_job_status NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  
  -- Idempotency
  request_payload_hash TEXT NOT NULL, -- sha256 of composed prompt for dedup
  
  -- Costs tracking
  credits_charged INTEGER, -- set when job succeeds or fails
  refunded BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated videos (storage references)
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id UUID NOT NULL UNIQUE REFERENCES battles(id) ON DELETE CASCADE,
  video_job_id UUID NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
  
  -- Storage paths (Supabase Storage)
  storage_path TEXT NOT NULL UNIQUE, -- videos/{battle_id}/{video_id}.mp4
  thumbnail_path TEXT UNIQUE, -- videos/{battle_id}/{video_id}_thumb.jpg
  
  -- Metadata
  duration_ms INTEGER,
  file_size_bytes BIGINT,
  mime_type TEXT NOT NULL DEFAULT 'video/mp4',
  
  -- Moderation
  moderation_status moderation_status NOT NULL DEFAULT 'pending',
  moderation_reason TEXT,
  blurred_preview_url TEXT, -- shown until moderation passes
  
  -- Visibility
  visibility TEXT NOT NULL DEFAULT 'private', -- private | public | reported
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--------------------------------------------------------------------------------
-- WALLET AND ECONOMY TABLES
--------------------------------------------------------------------------------

-- Wallet transactions (immutable ledger)
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Transaction data
  amount INTEGER NOT NULL, -- positive = credit, negative = debit
  balance_after INTEGER NOT NULL, -- denormalized for quick display
  currency_type currency_type NOT NULL DEFAULT 'credits',
  
  -- Reason and context
  reason TEXT NOT NULL, -- daily_login, quest_complete, battle_win, video_upgrade, purchase, refund
  battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
  purchase_id UUID, -- FK to purchases, added below
  video_job_id UUID REFERENCES video_jobs(id) ON DELETE SET NULL,
  metadata JSONB, -- additional context
  
  -- Idempotency
  idempotency_key TEXT UNIQUE, -- for refunds, provider callbacks, concurrent grants
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT credits_nonnegative_balance CHECK (
    currency_type != 'credits' OR balance_after >= 0
  )
);

-- Purchases (RevenueCat mirrored via webhook)
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- RevenueCat data
  revenuecat_transaction_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL, -- credits_10, credits_30, etc.
  
  -- Purchase metadata
  amount_usd NUMERIC(10, 2),
  currency_code TEXT,
  platform TEXT NOT NULL, -- ios | android | web
  
  -- Fulfillment
  credits_granted INTEGER,
  fulfilled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions (RevenueCat mirrored via webhook)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- RevenueCat data
  revenuecat_subscription_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL, -- promptwars_plus_monthly | promptwars_plus_annual
  
  -- Subscription state
  status TEXT NOT NULL, -- active | canceled | expired | paused
  tier TEXT NOT NULL DEFAULT 'plus', -- plus (only tier in MVP)
  
  -- Allowances
  monthly_video_allowance INTEGER NOT NULL DEFAULT 30,
  monthly_video_allowance_used INTEGER NOT NULL DEFAULT 0,
  allowance_reset_at TIMESTAMPTZ NOT NULL,
  
  -- Dates
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Entitlements derived view (feature gate source, never insert here)
CREATE OR REPLACE VIEW entitlements AS
SELECT 
  p.id AS profile_id,
  COALESCE(s.status = 'active', FALSE) AS is_subscriber,
  s.tier AS subscription_tier,
  COALESCE(s.monthly_video_allowance - s.monthly_video_allowance_used, 0) AS monthly_video_allowance_remaining,
  COALESCE(
    (SELECT SUM(amount) FROM wallet_transactions wt 
     WHERE wt.profile_id = p.id AND wt.currency_type = 'credits'),
    0
  ) AS credits_balance,
  COALESCE(s.status = 'active', FALSE) AS priority_queue,
  -- Cosmetic unlocks placeholder
  '[]'::JSONB AS cosmetic_unlocks,
  GREATEST(p.updated_at, s.updated_at, 
    (SELECT MAX(created_at) FROM wallet_transactions wt WHERE wt.profile_id = p.id)
  ) AS updated_at
FROM profiles p
LEFT JOIN subscriptions s ON s.profile_id = p.id AND s.status = 'active'
;

--------------------------------------------------------------------------------
-- SEASONS AND RANKINGS
--------------------------------------------------------------------------------

-- Seasons
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season_number INTEGER NOT NULL UNIQUE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  rewards_config JSONB, -- placement rewards, cosmetics, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT valid_season_dates CHECK (ends_at > starts_at)
);

-- Rankings snapshot (updated post-battle)
CREATE TABLE rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  
  -- Ranking data
  rank INTEGER,
  rating NUMERIC(8, 2) NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  
  -- Snapshot timestamp
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_ranking_per_profile_per_season UNIQUE (profile_id, season_id)
);

--------------------------------------------------------------------------------
-- DAILY META: QUESTS AND THEMES
--------------------------------------------------------------------------------

-- Daily quests (curated tasks)
CREATE TABLE daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  quest_type TEXT NOT NULL, -- win_battle, complete_3_battles, use_finisher_move, etc.
  target_value INTEGER NOT NULL DEFAULT 1,
  reward_credits INTEGER NOT NULL DEFAULT 1,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  active_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Player quest progress
CREATE TABLE player_daily_quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  daily_quest_id UUID NOT NULL REFERENCES daily_quests(id) ON DELETE CASCADE,
  
  -- Progress
  current_value INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  
  quest_date DATE NOT NULL,
  
  CONSTRAINT one_quest_per_player_per_day UNIQUE (profile_id, daily_quest_id, quest_date)
);

-- Daily themes (shared global prompt constraint)
CREATE TABLE daily_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_text TEXT NOT NULL,
  theme_date DATE NOT NULL UNIQUE,
  leaderboard_snapshot JSONB, -- top 10 at end of day
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--------------------------------------------------------------------------------
-- MODERATION AND SAFETY
--------------------------------------------------------------------------------

-- Moderation events (audit log)
CREATE TABLE moderation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Target
  target_type TEXT NOT NULL, -- battle_prompt | video | profile | report
  target_id UUID NOT NULL,
  
  -- Decision
  action TEXT NOT NULL, -- approved | rejected | flagged | banned
  reason TEXT,
  moderator_notes TEXT,
  
  -- Context
  automated BOOLEAN NOT NULL DEFAULT TRUE,
  moderator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User reports
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Target
  reported_type TEXT NOT NULL, -- battle | video | profile
  reported_id UUID NOT NULL,
  reported_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Report data
  reason TEXT NOT NULL, -- inappropriate | harassment | cheating | spam
  description TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending | reviewed | actioned | dismissed
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Blocks (user-initiated)
CREATE TABLE blocks (
  blocker_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (blocker_profile_id, blocked_profile_id),
  CONSTRAINT not_self_block CHECK (blocker_profile_id != blocked_profile_id)
);

--------------------------------------------------------------------------------
-- PUSH NOTIFICATIONS
--------------------------------------------------------------------------------

-- Push tokens (device registration)
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- ios | android | web
  token TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE notification_preferences (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Categories
  result_ready BOOLEAN NOT NULL DEFAULT TRUE, -- must-send category
  opponent_submitted BOOLEAN NOT NULL DEFAULT TRUE,
  video_ready BOOLEAN NOT NULL DEFAULT TRUE,
  daily_quest BOOLEAN NOT NULL DEFAULT TRUE,
  friend_challenge BOOLEAN NOT NULL DEFAULT TRUE,
  season_ending BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Frequency cap
  max_per_day INTEGER NOT NULL DEFAULT 2,
  
  -- Quiet hours
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notification send log (for frequency cap enforcement)
CREATE TABLE notification_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--------------------------------------------------------------------------------
-- INDEXES
--------------------------------------------------------------------------------

-- Video jobs
CREATE INDEX idx_video_jobs_battle ON video_jobs(battle_id);
CREATE INDEX idx_video_jobs_status ON video_jobs(status) WHERE status IN ('queued', 'submitted', 'processing');
CREATE INDEX idx_video_jobs_provider_id ON video_jobs(provider_job_id) WHERE provider_job_id IS NOT NULL;

-- Videos
CREATE INDEX idx_videos_battle ON videos(battle_id);
CREATE INDEX idx_videos_moderation ON videos(moderation_status) WHERE moderation_status = 'pending';

-- Wallet
CREATE INDEX idx_wallet_transactions_profile ON wallet_transactions(profile_id, created_at DESC);
CREATE INDEX idx_wallet_transactions_idempotency ON wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Purchases
CREATE INDEX idx_purchases_profile ON purchases(profile_id, created_at DESC);
CREATE INDEX idx_purchases_revenuecat_id ON purchases(revenuecat_transaction_id);

-- Subscriptions
CREATE INDEX idx_subscriptions_profile_active ON subscriptions(profile_id) WHERE status = 'active';
CREATE INDEX idx_subscriptions_revenuecat_id ON subscriptions(revenuecat_subscription_id);

-- Rankings
CREATE INDEX idx_rankings_season_rank ON rankings(season_id, rank NULLS LAST);
CREATE INDEX idx_rankings_profile_season ON rankings(profile_id, season_id);
CREATE UNIQUE INDEX one_active_season ON seasons(is_active) WHERE is_active = TRUE;

-- Daily quests
CREATE INDEX idx_daily_quests_active_date ON daily_quests(active_date) WHERE is_active = TRUE;
CREATE INDEX idx_player_daily_quests_profile_date ON player_daily_quests(profile_id, quest_date);

-- Daily themes
CREATE INDEX idx_daily_themes_date ON daily_themes(theme_date DESC);

-- Moderation events
CREATE INDEX idx_moderation_events_target ON moderation_events(target_type, target_id);

-- Reports
CREATE INDEX idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX idx_reports_reported_profile ON reports(reported_profile_id) WHERE reported_profile_id IS NOT NULL;

-- Blocks
CREATE INDEX idx_blocks_blocker ON blocks(blocker_profile_id);

-- Push tokens
CREATE INDEX idx_push_tokens_profile_active ON push_tokens(profile_id) WHERE is_active = TRUE;

-- Notification sends (for daily cap, retain 2 days)
CREATE INDEX idx_notification_sends_profile_date ON notification_sends(profile_id, sent_at DESC);

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY
--------------------------------------------------------------------------------

ALTER TABLE video_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_sends ENABLE ROW LEVEL SECURITY;

-- Video jobs: users can read jobs for their battles
CREATE POLICY video_jobs_select_own_battles ON video_jobs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM battles 
    WHERE battles.id = video_jobs.battle_id 
      AND (battles.player_one_id = auth.uid() OR battles.player_two_id = auth.uid())
  )
);

-- Videos: users can read videos for their battles (if moderation passed)
CREATE POLICY videos_select_own_battles ON videos FOR SELECT USING (
  moderation_status = 'approved' AND
  EXISTS (
    SELECT 1 FROM battles 
    WHERE battles.id = videos.battle_id 
      AND (battles.player_one_id = auth.uid() OR battles.player_two_id = auth.uid())
  )
);

-- Wallet: users can read own transactions
CREATE POLICY wallet_transactions_select_own ON wallet_transactions FOR SELECT USING (
  profile_id = auth.uid()
);

-- Purchases: users can read own purchases
CREATE POLICY purchases_select_own ON purchases FOR SELECT USING (
  profile_id = auth.uid()
);

-- Subscriptions: users can read own subscriptions
CREATE POLICY subscriptions_select_own ON subscriptions FOR SELECT USING (
  profile_id = auth.uid()
);

-- Seasons: all users can read
CREATE POLICY seasons_select_all ON seasons FOR SELECT USING (TRUE);

-- Rankings: all users can read (public leaderboard)
CREATE POLICY rankings_select_all ON rankings FOR SELECT USING (TRUE);

-- Daily quests: all users can read active quests
CREATE POLICY daily_quests_select_active ON daily_quests FOR SELECT USING (
  is_active = TRUE AND active_date = CURRENT_DATE
);

-- Player daily quests: users can read/update own quests
CREATE POLICY player_daily_quests_select_own ON player_daily_quests FOR SELECT USING (
  profile_id = auth.uid()
);

CREATE POLICY player_daily_quests_insert_own ON player_daily_quests FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);

CREATE POLICY player_daily_quests_update_own ON player_daily_quests FOR UPDATE USING (
  profile_id = auth.uid()
);

-- Daily themes: all users can read
CREATE POLICY daily_themes_select_all ON daily_themes FOR SELECT USING (TRUE);

-- Moderation events: no client access
CREATE POLICY moderation_events_no_client_access ON moderation_events FOR SELECT USING (FALSE);

-- Reports: users can create reports, read own reports
CREATE POLICY reports_select_own ON reports FOR SELECT USING (
  reporter_profile_id = auth.uid()
);

CREATE POLICY reports_insert_own ON reports FOR INSERT WITH CHECK (
  reporter_profile_id = auth.uid()
);

-- Blocks: users can CRUD own blocks
CREATE POLICY blocks_select_own ON blocks FOR SELECT USING (
  blocker_profile_id = auth.uid()
);

CREATE POLICY blocks_insert_own ON blocks FOR INSERT WITH CHECK (
  blocker_profile_id = auth.uid()
);

CREATE POLICY blocks_delete_own ON blocks FOR DELETE USING (
  blocker_profile_id = auth.uid()
);

-- Push tokens: users can CRUD own tokens
CREATE POLICY push_tokens_select_own ON push_tokens FOR SELECT USING (
  profile_id = auth.uid()
);

CREATE POLICY push_tokens_insert_own ON push_tokens FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);

CREATE POLICY push_tokens_update_own ON push_tokens FOR UPDATE USING (
  profile_id = auth.uid()
);

CREATE POLICY push_tokens_delete_own ON push_tokens FOR DELETE USING (
  profile_id = auth.uid()
);

-- Notification preferences: users can read/update own preferences
CREATE POLICY notification_preferences_select_own ON notification_preferences FOR SELECT USING (
  profile_id = auth.uid()
);

CREATE POLICY notification_preferences_insert_own ON notification_preferences FOR INSERT WITH CHECK (
  profile_id = auth.uid()
);

CREATE POLICY notification_preferences_update_own ON notification_preferences FOR UPDATE USING (
  profile_id = auth.uid()
);

-- Notification sends: no client access
CREATE POLICY notification_sends_no_client_access ON notification_sends FOR SELECT USING (FALSE);

--------------------------------------------------------------------------------
-- REALTIME PUBLICATION
--------------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE video_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE appeals;

--------------------------------------------------------------------------------
-- TRIGGERS
--------------------------------------------------------------------------------

CREATE TRIGGER video_jobs_updated_at BEFORE UPDATE ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER push_tokens_updated_at BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add FK constraint to wallet_transactions.purchase_id now that purchases table exists
ALTER TABLE wallet_transactions 
  ADD CONSTRAINT fk_wallet_transactions_purchase 
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL;

-- Add FK constraint to battles.season_id now that seasons table exists
ALTER TABLE battles 
  ADD CONSTRAINT fk_battles_season 
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;

CREATE INDEX idx_battles_season ON battles(season_id) WHERE season_id IS NOT NULL;
