-- Prompt Wars AI Video Pipeline Extension
-- Adds Tier 0 reveal payload storage, video captions, and provider callback idempotency

--------------------------------------------------------------------------------
-- BATTLES TABLE EXTENSION
--------------------------------------------------------------------------------

-- Add Tier 0 reveal payload to battles
ALTER TABLE battles ADD COLUMN IF NOT EXISTS tier0_reveal_payload JSONB;
ALTER TABLE battles ADD COLUMN IF NOT EXISTS judge_model_id TEXT;

-- Index for reveal payload queries
CREATE INDEX IF NOT EXISTS idx_battles_tier0_reveal ON battles (id) WHERE tier0_reveal_payload IS NOT NULL;

--------------------------------------------------------------------------------
-- VIDEO CAPTIONS TABLE
--------------------------------------------------------------------------------

-- Auto-generated captions for Tier 1 videos (accessibility + share-readiness)
CREATE TABLE IF NOT EXISTS video_captions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  
  -- Caption formats
  vtt_storage_path TEXT, -- WebVTT format
  srt_storage_path TEXT, -- SRT format
  json_payload JSONB, -- structured caption data for custom rendering
  
  -- Generation metadata
  generator TEXT NOT NULL DEFAULT 'auto', -- auto | manual
  locale TEXT NOT NULL DEFAULT 'en-US',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT one_caption_per_video_per_locale UNIQUE (video_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_video_captions_video_id ON video_captions (video_id);

--------------------------------------------------------------------------------
-- PROVIDER CALLBACK IDEMPOTENCY
--------------------------------------------------------------------------------

-- Track provider webhook callbacks to prevent duplicate processing
CREATE TABLE IF NOT EXISTS provider_callbacks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL, -- xai | openai | mock
  callback_type TEXT NOT NULL, -- video_complete | moderation_result
  idempotency_key TEXT NOT NULL UNIQUE,
  
  -- Callback payload
  payload JSONB NOT NULL,
  
  -- Processing status
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  
  -- Reference IDs
  video_job_id UUID REFERENCES video_jobs(id) ON DELETE SET NULL,
  battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_callbacks_idempotency ON provider_callbacks (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_provider_callbacks_video_job ON provider_callbacks (video_job_id) WHERE video_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_provider_callbacks_unprocessed ON provider_callbacks (created_at) WHERE processed = FALSE;

--------------------------------------------------------------------------------
-- JUDGE RUNS TABLE EXTENSION (adds columns if not exists)
--------------------------------------------------------------------------------

-- Add columns to existing judge_runs table from core schema
ALTER TABLE judge_runs ADD COLUMN IF NOT EXISTS is_tiebreaker BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE judge_runs ADD COLUMN IF NOT EXISTS is_appeal BOOLEAN NOT NULL DEFAULT FALSE;

-- Update existing index if needed
CREATE INDEX IF NOT EXISTS idx_judge_runs_prompt_version ON judge_runs (judge_prompt_version);
CREATE INDEX IF NOT EXISTS idx_judge_runs_appeal ON judge_runs (battle_id) WHERE is_appeal = TRUE;

--------------------------------------------------------------------------------
-- APPEALS TABLE EXTENSION (adds columns if not exists)
--------------------------------------------------------------------------------

-- Add columns to existing appeals table from core schema
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS appeal_judge_run_id UUID REFERENCES judge_runs(id) ON DELETE SET NULL;
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS rating_reverted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appeals ADD COLUMN IF NOT EXISTS reversion_payload JSONB;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_appeals_profile_pending ON appeals (profile_id, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_appeals_battle_id ON appeals (battle_id);

--------------------------------------------------------------------------------
-- VIDEO_JOBS TABLE EXTENSION (source-aware refunds)
--------------------------------------------------------------------------------

-- Add requester and entitlement tracking columns
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS requester_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS entitlement_source TEXT; -- credits | subscription_allowance | free_grant
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS spend_transaction_id UUID REFERENCES wallet_transactions(id) ON DELETE SET NULL;

-- Index for refund queries
CREATE INDEX IF NOT EXISTS idx_video_jobs_requester ON video_jobs (requester_profile_id) WHERE requester_profile_id IS NOT NULL;

COMMENT ON COLUMN video_jobs.requester_profile_id IS 'Profile who requested and paid for the video upgrade.';
COMMENT ON COLUMN video_jobs.entitlement_source IS 'Payment method used: credits, subscription_allowance, or free_grant.';
COMMENT ON COLUMN video_jobs.spend_transaction_id IS 'Wallet transaction ID for credit spends (NULL for subscription/free).';

--------------------------------------------------------------------------------
-- COMMENTS
--------------------------------------------------------------------------------

COMMENT ON COLUMN battles.tier0_reveal_payload IS 'Tier 0 cinematic reveal metadata: motion poster, music sting, voice line, score card. Always generated, never blocks battle completion.';
COMMENT ON COLUMN battles.judge_model_id IS 'Judge model ID used for scoring (frozen per battle for reproducibility).';

COMMENT ON TABLE video_captions IS 'Auto-generated captions for Tier 1 videos. Required for accessibility and share-readiness.';
COMMENT ON TABLE provider_callbacks IS 'Idempotency tracking for provider webhooks (xAI, etc.) to prevent duplicate processing.';

--------------------------------------------------------------------------------
-- FREE TIER 1 REVEAL CONSUMPTION
--------------------------------------------------------------------------------

-- Atomically consume a free Tier 1 reveal grant
-- Returns transaction UUID on success, NULL on failure
CREATE OR REPLACE FUNCTION consume_free_tier1_reveal(
  p_profile_id UUID,
  p_battle_id UUID,
  p_idempotency_key TEXT
)
RETURNS UUID AS $$
DECLARE
  v_transaction_id UUID;
  v_current_balance INTEGER;
  v_created_at TIMESTAMPTZ;
  v_free_reveals INTEGER;
  v_account_age_ms BIGINT;
  v_seven_days_ms BIGINT := 7 * 24 * 60 * 60 * 1000;
BEGIN
  -- Check for existing transaction (idempotency)
  SELECT id INTO v_transaction_id 
  FROM wallet_transactions 
  WHERE idempotency_key = p_idempotency_key;
  
  IF v_transaction_id IS NOT NULL THEN
    RETURN v_transaction_id; -- Already processed
  END IF;
  
  -- Get profile info with FOR UPDATE to lock row
  SELECT created_at, free_tier1_reveals_remaining
  INTO v_created_at, v_free_reveals
  FROM profiles
  WHERE id = p_profile_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN NULL; -- Profile not found
  END IF;
  
  -- Check account age (must be within first 7 days)
  v_account_age_ms := EXTRACT(EPOCH FROM (NOW() - v_created_at)) * 1000;
  IF v_account_age_ms > v_seven_days_ms THEN
    RETURN NULL; -- Too old
  END IF;
  
  -- Check remaining grants
  IF v_free_reveals IS NULL OR v_free_reveals <= 0 THEN
    RETURN NULL; -- No grants remaining
  END IF;
  
  -- Decrement free reveals
  UPDATE profiles
  SET free_tier1_reveals_remaining = free_tier1_reveals_remaining - 1
  WHERE id = p_profile_id;
  
  -- Get current credit balance for audit transaction
  SELECT COALESCE(SUM(amount), 0) INTO v_current_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits';
  
  -- Insert zero-amount audit transaction (balance unchanged)
  INSERT INTO wallet_transactions (
    profile_id,
    amount,
    balance_after,
    currency_type,
    reason,
    battle_id,
    idempotency_key,
    metadata
  )
  VALUES (
    p_profile_id,
    0,
    v_current_balance,
    'credits',
    'free_tier1_grant',
    p_battle_id,
    p_idempotency_key,
    jsonb_build_object('tier', 'tier1', 'free_grant', true)
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION consume_free_tier1_reveal IS 'Atomically consumes a free Tier 1 reveal grant if profile is eligible (first 7 days, has remaining grants). Returns transaction UUID on success, NULL on failure.';

--------------------------------------------------------------------------------
-- RESTORE FREE TIER 1 REVEAL (for video job failures)
--------------------------------------------------------------------------------

-- Restore a free Tier 1 reveal grant (idempotent)
CREATE OR REPLACE FUNCTION restore_free_tier1_reveal(
  p_profile_id UUID,
  p_video_job_id UUID,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_transaction_exists BOOLEAN;
  v_current_reveals INTEGER;
  v_max_reveals INTEGER := 3;
BEGIN
  -- Check idempotency (ensure we don't restore twice)
  SELECT EXISTS(
    SELECT 1 FROM wallet_transactions 
    WHERE idempotency_key = p_idempotency_key
  ) INTO v_transaction_exists;
  
  IF v_transaction_exists THEN
    RETURN TRUE; -- Already processed
  END IF;
  
  -- Increment free reveals (with ceiling at max)
  UPDATE profiles
  SET free_tier1_reveals_remaining = LEAST(free_tier1_reveals_remaining + 1, v_max_reveals)
  WHERE id = p_profile_id
  RETURNING free_tier1_reveals_remaining INTO v_current_reveals;
  
  IF NOT FOUND THEN
    RETURN FALSE; -- Profile not found
  END IF;
  
  -- Insert audit transaction (zero-amount, just for tracking)
  INSERT INTO wallet_transactions (
    profile_id,
    amount,
    balance_after,
    currency_type,
    reason,
    video_job_id,
    idempotency_key,
    metadata
  )
  SELECT 
    p_profile_id,
    0,
    COALESCE(SUM(wt.amount), 0),
    'credits',
    'free_tier1_grant_restored',
    p_video_job_id,
    p_idempotency_key,
    jsonb_build_object('restored', true, 'new_count', v_current_reveals)
  FROM wallet_transactions wt
  WHERE wt.profile_id = p_profile_id AND wt.currency_type = 'credits';
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION restore_free_tier1_reveal IS 'Restores a free Tier 1 reveal grant when video job creation or generation fails. Idempotent via idempotency_key.';

--------------------------------------------------------------------------------
-- RESTORE SUBSCRIPTION ALLOWANCE (for video job failures)
--------------------------------------------------------------------------------

-- Restore one monthly video allowance slot (idempotent)
CREATE OR REPLACE FUNCTION restore_subscription_allowance(
  p_profile_id UUID,
  p_video_job_id UUID,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_transaction_exists BOOLEAN;
  v_sub_id UUID;
BEGIN
  -- Check idempotency
  SELECT EXISTS(
    SELECT 1 FROM wallet_transactions 
    WHERE idempotency_key = p_idempotency_key
  ) INTO v_transaction_exists;
  
  IF v_transaction_exists THEN
    RETURN TRUE; -- Already processed
  END IF;
  
  -- Find active subscription
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE profile_id = p_profile_id
    AND status = 'active'
  LIMIT 1;
  
  IF v_sub_id IS NULL THEN
    RETURN FALSE; -- No active subscription
  END IF;
  
  -- Decrement allowance used (with floor at 0)
  UPDATE subscriptions
  SET 
    monthly_video_allowance_used = GREATEST(monthly_video_allowance_used - 1, 0),
    updated_at = NOW()
  WHERE id = v_sub_id;
  
  -- Insert audit transaction (zero-amount, just for tracking)
  INSERT INTO wallet_transactions (
    profile_id,
    amount,
    balance_after,
    currency_type,
    reason,
    video_job_id,
    idempotency_key,
    metadata
  )
  SELECT 
    p_profile_id,
    0,
    COALESCE(SUM(wt.amount), 0),
    'credits',
    'subscription_allowance_restored',
    p_video_job_id,
    p_idempotency_key,
    jsonb_build_object('restored', true, 'subscription_id', v_sub_id)
  FROM wallet_transactions wt
  WHERE wt.profile_id = p_profile_id AND wt.currency_type = 'credits';
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION restore_subscription_allowance IS 'Restores one monthly video allowance when video job creation or generation fails. Idempotent via idempotency_key.';
