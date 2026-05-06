-- Prompt Wars Safety, Moderation, and Anti-Abuse Extensions
-- Adds account-farm guard, SLA tracking, device/IP metadata, notification audit

--------------------------------------------------------------------------------
-- ACCOUNT ABUSE AND ANTI-FARM GUARD
--------------------------------------------------------------------------------

-- Account abuse signals (server-side only, never exposed to client)
CREATE TABLE account_abuse_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Signup metadata
  signup_device_fingerprint TEXT, -- client-provided hash or server-derived
  signup_ip_address INET,
  signup_ip_country TEXT,
  signup_platform TEXT, -- ios | android | web
  
  -- Attestation / proof of work (platform-specific)
  device_attestation_token TEXT,
  device_attestation_verified BOOLEAN DEFAULT FALSE,
  
  -- Velocity signals (computed server-side)
  ip_signup_count_24h INTEGER DEFAULT 0,
  device_signup_count_24h INTEGER DEFAULT 0,
  
  -- Behavioral signals
  battles_created_24h INTEGER DEFAULT 0,
  prompts_submitted_24h INTEGER DEFAULT 0,
  videos_requested_24h INTEGER DEFAULT 0,
  reports_submitted_24h INTEGER DEFAULT 0,
  
  -- Account status
  is_flagged_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
  flagged_reason TEXT,
  flagged_at TIMESTAMPTZ,
  
  -- FTUO and credit grants
  ftuo_eligible BOOLEAN DEFAULT TRUE,
  ftuo_shown_at TIMESTAMPTZ,
  ftuo_purchased_at TIMESTAMPTZ,
  onboarding_credits_granted BOOLEAN DEFAULT FALSE,
  onboarding_credits_granted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for IP and device velocity checks
CREATE INDEX idx_abuse_signals_ip ON account_abuse_signals(signup_ip_address, created_at);
CREATE INDEX idx_abuse_signals_device ON account_abuse_signals(signup_device_fingerprint, created_at);
CREATE INDEX idx_abuse_signals_flagged ON account_abuse_signals(is_flagged_suspicious) WHERE is_flagged_suspicious = TRUE;

--------------------------------------------------------------------------------
-- ENHANCED REPORTS TABLE WITH SLA
--------------------------------------------------------------------------------

-- Add SLA and notification fields to existing reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_notified BOOLEAN DEFAULT FALSE;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_notified_at TIMESTAMPTZ;

-- Update existing reports to set due_at = created_at + 24 hours if null
UPDATE reports SET due_at = created_at + INTERVAL '24 hours' WHERE due_at IS NULL;

-- Make due_at NOT NULL going forward
ALTER TABLE reports ALTER COLUMN due_at SET NOT NULL;
ALTER TABLE reports ALTER COLUMN due_at SET DEFAULT NOW() + INTERVAL '24 hours';

-- Index for SLA queue (pending reports ordered by due_at)
CREATE INDEX idx_reports_sla_queue ON reports(status, due_at) WHERE status = 'pending';

--------------------------------------------------------------------------------
-- MODERATION QUEUE METADATA
--------------------------------------------------------------------------------

-- Add moderation queue metadata to moderation_events
ALTER TABLE moderation_events ADD COLUMN IF NOT EXISTS provider TEXT; -- openai | perspective | manual
ALTER TABLE moderation_events ADD COLUMN IF NOT EXISTS provider_request_id TEXT;
ALTER TABLE moderation_events ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3, 2); -- 0.00 to 1.00
ALTER TABLE moderation_events ADD COLUMN IF NOT EXISTS flagged_categories TEXT[]; -- array of category names

-- Index for audit and review
CREATE INDEX idx_moderation_events_provider ON moderation_events(provider, created_at);
CREATE INDEX idx_moderation_events_confidence ON moderation_events(confidence_score) WHERE confidence_score < 0.80;

--------------------------------------------------------------------------------
-- NOTIFICATION AUDIT
--------------------------------------------------------------------------------

-- Add metadata to notification_sends for audit
ALTER TABLE notification_sends ADD COLUMN IF NOT EXISTS battle_id UUID REFERENCES battles(id) ON DELETE SET NULL;
ALTER TABLE notification_sends ADD COLUMN IF NOT EXISTS video_job_id UUID REFERENCES video_jobs(id) ON DELETE SET NULL;
ALTER TABLE notification_sends ADD COLUMN IF NOT EXISTS opened BOOLEAN DEFAULT FALSE;
ALTER TABLE notification_sends ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

-- Index for frequency cap enforcement (profile_id, sent_at DESC for last N per day)
CREATE INDEX idx_notification_sends_frequency ON notification_sends(profile_id, sent_at DESC);

--------------------------------------------------------------------------------
-- VIDEO MODERATION METADATA
--------------------------------------------------------------------------------

-- Add post-gen moderation fields to videos
ALTER TABLE videos ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS moderation_provider TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS moderation_confidence NUMERIC(3, 2);

--------------------------------------------------------------------------------
-- ANTI-COLLUSION SIGNALS
--------------------------------------------------------------------------------

-- Track opponent pairs for diversity enforcement
CREATE TABLE opponent_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  battle_mode battle_mode NOT NULL,
  
  -- For ranked diversity checks
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT not_self_opponent CHECK (profile_id != opponent_id)
);

-- Index for 24h ranked opponent diversity
CREATE INDEX idx_opponent_history_diversity ON opponent_history(profile_id, opponent_id, created_at DESC, battle_mode)
  WHERE battle_mode = 'ranked';

-- Index for rival detection (most-played opponent in last 30 days)
CREATE INDEX idx_opponent_history_rival ON opponent_history(profile_id, created_at DESC)
  WHERE created_at > NOW() - INTERVAL '30 days';

-- Shadow rating for anomaly review
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shadow_rating NUMERIC(8, 2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shadow_rating_enabled BOOLEAN DEFAULT FALSE;

--------------------------------------------------------------------------------
-- RLS POLICIES
--------------------------------------------------------------------------------

-- Account abuse signals: service role only, never client-readable
ALTER TABLE account_abuse_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account abuse signals are service-role only"
  ON account_abuse_signals
  USING (FALSE);

-- Opponent history: service role only
ALTER TABLE opponent_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Opponent history is service-role only"
  ON opponent_history
  USING (FALSE);

-- Reports: reporter can read their own reports
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_profile_id);

CREATE POLICY "Users can insert their own reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_profile_id);

-- Blocks: users can manage their own blocks
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own blocks"
  ON blocks FOR SELECT
  USING (auth.uid() = blocker_profile_id);

CREATE POLICY "Users can insert their own blocks"
  ON blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_profile_id);

CREATE POLICY "Users can delete their own blocks"
  ON blocks FOR DELETE
  USING (auth.uid() = blocker_profile_id);

--------------------------------------------------------------------------------
-- HELPER FUNCTIONS
--------------------------------------------------------------------------------

-- Check if user has blocked or been blocked by another user
CREATE OR REPLACE FUNCTION is_blocked(p_profile_id UUID, p_other_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_profile_id = p_profile_id AND blocked_profile_id = p_other_profile_id)
       OR (blocker_profile_id = p_other_profile_id AND blocked_profile_id = p_profile_id)
  );
END;
$$;

-- Count ranked battles against the same opponent in last 24h
CREATE OR REPLACE FUNCTION ranked_battles_vs_opponent_24h(p_profile_id UUID, p_opponent_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  battle_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO battle_count
  FROM opponent_history
  WHERE profile_id = p_profile_id
    AND opponent_id = p_opponent_id
    AND battle_mode = 'ranked'
    AND created_at > NOW() - INTERVAL '24 hours';
  
  RETURN COALESCE(battle_count, 0);
END;
$$;

-- Get IP signup velocity (count in last 24h)
CREATE OR REPLACE FUNCTION ip_signup_velocity(p_ip_address INET)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  signup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO signup_count
  FROM account_abuse_signals
  WHERE signup_ip_address = p_ip_address
    AND created_at > NOW() - INTERVAL '24 hours';
  
  RETURN COALESCE(signup_count, 0);
END;
$$;

-- Get device fingerprint signup velocity (count in last 24h)
CREATE OR REPLACE FUNCTION device_signup_velocity(p_device_fingerprint TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  signup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO signup_count
  FROM account_abuse_signals
  WHERE signup_device_fingerprint = p_device_fingerprint
    AND created_at > NOW() - INTERVAL '24 hours';
  
  RETURN COALESCE(signup_count, 0);
END;
$$;

-- Increment abuse signal counter (rate limiting helper)
CREATE OR REPLACE FUNCTION increment_abuse_counter(
  p_profile_id UUID,
  p_counter TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update counter based on name
  IF p_counter = 'battles_created_24h' THEN
    UPDATE account_abuse_signals
    SET battles_created_24h = battles_created_24h + 1,
        updated_at = NOW()
    WHERE profile_id = p_profile_id;
  ELSIF p_counter = 'prompts_submitted_24h' THEN
    UPDATE account_abuse_signals
    SET prompts_submitted_24h = prompts_submitted_24h + 1,
        updated_at = NOW()
    WHERE profile_id = p_profile_id;
  ELSIF p_counter = 'videos_requested_24h' THEN
    UPDATE account_abuse_signals
    SET videos_requested_24h = videos_requested_24h + 1,
        updated_at = NOW()
    WHERE profile_id = p_profile_id;
  ELSIF p_counter = 'reports_submitted_24h' THEN
    UPDATE account_abuse_signals
    SET reports_submitted_24h = reports_submitted_24h + 1,
        updated_at = NOW()
    WHERE profile_id = p_profile_id;
  ELSE
    RETURN FALSE;
  END IF;
  
  RETURN FOUND;
END;
$$;

COMMENT ON TABLE account_abuse_signals IS 'Server-side anti-abuse signals, never exposed to client';
COMMENT ON TABLE opponent_history IS 'Track opponent pairs for anti-collusion and rival detection';
COMMENT ON FUNCTION is_blocked IS 'Check if two users have blocked each other (bidirectional)';
COMMENT ON FUNCTION ranked_battles_vs_opponent_24h IS 'Count ranked battles vs same opponent in last 24h for diversity enforcement';
