-- Per-round cinematic pipeline (Bo3 Phase 2)
-- Makes `video_jobs` round-aware so each `battle_rounds` row can have its own
-- Tier 0/1 cinematic job(s). Legacy series-end jobs (battle_round_id IS NULL)
-- continue to be one-per-battle.
--
-- Service-role only mutations (no client policies altered here).

--------------------------------------------------------------------------------
-- VIDEO_JOBS: round-aware columns
--------------------------------------------------------------------------------

-- Round linkage (nullable for legacy / series-end rows).
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS battle_round_id UUID
    REFERENCES battle_rounds(id) ON DELETE SET NULL;

ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS round_number SMALLINT
    CHECK (round_number IS NULL OR round_number BETWEEN 1 AND 3);

-- Tier (0 = free composed reveal, 1 = paid provider cinematic).
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS tier SMALLINT NOT NULL DEFAULT 1
    CHECK (tier IN (0, 1));

-- Trigger source for refund / accounting policy.
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS trigger TEXT
    CHECK (trigger IS NULL OR trigger IN (
      'auto_free',
      'auto_subscriber',
      'on_demand_credit',
      'on_demand_grant',
      'series_end_legacy'
    ));

-- Per-row idempotency hash for retries (distinct from request_payload_hash
-- which is the pre-spend hash; this one is the composed-provider-payload hash).
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS input_payload_hash TEXT;

-- Cost / refund accounting in abstract "units" (1 unit == 1 round Tier 1 today).
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS cost_units INTEGER NOT NULL DEFAULT 0;

ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS refund_units INTEGER NOT NULL DEFAULT 0;

-- Retry telemetry (independent of attempt_count which the legacy worker uses).
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

-- Asset URLs for accessibility and previews.
ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS caption_vtt_url TEXT;

ALTER TABLE video_jobs
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

--------------------------------------------------------------------------------
-- Drop legacy global UNIQUE(battle_id) so per-round rows can coexist.
--   - Legacy single-format jobs remain one-per-battle via a partial unique
--     index that targets only NULL battle_round_id rows.
--   - Round-aware jobs are uniquified by (battle_id, round_number, tier, trigger).
--------------------------------------------------------------------------------

-- The legacy NOT NULL UNIQUE was created inline in the original
-- economy_video_social migration. Constraint name follows PG default.
ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_battle_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_video_jobs_legacy_per_battle
  ON video_jobs (battle_id)
  WHERE battle_round_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_video_jobs_per_round_tier_trigger
  ON video_jobs (battle_id, round_number, tier, trigger)
  WHERE battle_round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_video_jobs_battle_round_tier
  ON video_jobs (battle_id, round_number, tier);

CREATE INDEX IF NOT EXISTS idx_video_jobs_battle_round_id
  ON video_jobs (battle_round_id)
  WHERE battle_round_id IS NOT NULL;

--------------------------------------------------------------------------------
-- VIDEOS: allow per-round videos (drop legacy UNIQUE on battle_id)
--------------------------------------------------------------------------------

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_battle_id_key;

-- Per-video_job_id is already 1:1 enforced by the FK + the workflow.
-- A partial unique on legacy keeps one video per battle for series-end rows.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_videos_legacy_per_battle
  ON videos (battle_id)
  WHERE video_job_id IN (SELECT id FROM video_jobs WHERE battle_round_id IS NULL);

--------------------------------------------------------------------------------
-- BATTLE_ROUNDS: cinematic write-back columns
--   (round-resolve writes these so the client's battle_rounds subscription
--    can render the per-round reveal without a separate join.)
--------------------------------------------------------------------------------

ALTER TABLE battle_rounds
  ADD COLUMN IF NOT EXISTS cinematic_video_job_id UUID
    REFERENCES video_jobs(id) ON DELETE SET NULL;

ALTER TABLE battle_rounds
  ADD COLUMN IF NOT EXISTS cinematic_asset_url TEXT;

ALTER TABLE battle_rounds
  ADD COLUMN IF NOT EXISTS cinematic_tier SMALLINT
    CHECK (cinematic_tier IS NULL OR cinematic_tier IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_battle_rounds_cinematic_job
  ON battle_rounds (cinematic_video_job_id)
  WHERE cinematic_video_job_id IS NOT NULL;

--------------------------------------------------------------------------------
-- COMMENTS
--------------------------------------------------------------------------------

COMMENT ON COLUMN video_jobs.battle_round_id IS
  'Round this job renders. NULL for legacy single-format / series-end jobs.';
COMMENT ON COLUMN video_jobs.round_number IS
  'Denormalized 1..3 for queryability; matches battle_rounds.round_number.';
COMMENT ON COLUMN video_jobs.tier IS
  '0 = free composed reveal (no provider call), 1 = paid provider cinematic.';
COMMENT ON COLUMN video_jobs.trigger IS
  'Source policy: auto_free | auto_subscriber | on_demand_credit | on_demand_grant | series_end_legacy.';
COMMENT ON COLUMN video_jobs.input_payload_hash IS
  'SHA256 of composed provider payload; used for retry idempotency dedup.';
COMMENT ON COLUMN video_jobs.cost_units IS
  'Abstract spend units; per-round Tier 1 = 1 unit.';
COMMENT ON COLUMN video_jobs.refund_units IS
  'Units refunded on terminal failure or moderation rejection.';
COMMENT ON COLUMN battle_rounds.cinematic_video_job_id IS
  'Pointer to the current Tier 0/1 video_jobs row driving this round''s reveal.';
COMMENT ON COLUMN battle_rounds.cinematic_asset_url IS
  'Resolved signed/public URL for the active cinematic asset (Tier 0 or Tier 1).';
COMMENT ON COLUMN battle_rounds.cinematic_tier IS
  '0 if showing free composed reveal, 1 if upgraded provider cinematic is ready.';
