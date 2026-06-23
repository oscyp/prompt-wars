-- Corrective migration: ensure the `videos`-table round-awareness artifacts
-- from 20260525140000 exist.
--
-- Why this exists: on the hosted project, 20260525140000 is recorded as
-- applied, but a schema dump shows the remote has the `video_jobs` and
-- `battle_rounds` portions of that migration WITHOUT the `videos` portion
-- (no `videos.battle_round_id` column, no `uniq_videos_legacy_per_battle`,
-- no `idx_videos_battle_round_id`). The `videos.battle_round_id` denormalized
-- column was introduced when 20260525140000 was repaired locally (the original
-- used an illegal subquery in a partial-index predicate), but because that
-- migration is already in the remote history, `supabase db push` will not
-- re-run it — so the fix never reaches remote.
--
-- This forward-only, fully idempotent migration reconciles both environments:
--   * On the hosted DB it adds the missing `videos` round-awareness objects.
--   * On a fresh/local DB the objects already exist (created by 20260525140000),
--     so every statement is a no-op via IF [NOT] EXISTS.
--
-- process-video-job inserts `videos.battle_round_id`, so without this the
-- hosted worker would fail at runtime. Service-role only; no client policies
-- are altered.

--------------------------------------------------------------------------------
-- VIDEOS: per-round support (mirrors the `videos` block of 20260525140000)
--------------------------------------------------------------------------------

-- Legacy global UNIQUE(battle_id) must be gone so per-round videos can coexist.
-- Safe no-op if it was never present / already dropped.
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_battle_id_key;

-- Denormalized round linkage. Partial index predicates cannot reference other
-- tables, so the round id lives on this table. NULL == legacy / series-end.
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS battle_round_id UUID
    REFERENCES battle_rounds(id) ON DELETE SET NULL;

-- One video per battle for legacy/series-end (NULL round) rows.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_videos_legacy_per_battle
  ON videos (battle_id)
  WHERE battle_round_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_videos_battle_round_id
  ON videos (battle_round_id)
  WHERE battle_round_id IS NOT NULL;

COMMENT ON COLUMN videos.battle_round_id IS
  'Round this video belongs to. NULL for legacy single-format / series-end videos.';
