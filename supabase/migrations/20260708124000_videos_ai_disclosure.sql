-- =============================================================================
-- AI-generation disclosure flag on stored videos (§8 / §21 / §22)
-- =============================================================================
-- Generated videos were copied from the provider byte-for-byte with no
-- machine-readable record that the asset is AI-generated; the disclosure
-- existed only in client UI overlays. Persist the flag on the videos row so
-- every render/share/export path (and any future feed or web embed) can
-- consume it without guessing.
--
-- Every video in this pipeline is provider-generated today, hence DEFAULT
-- TRUE + backfill. Burning a pixel watermark into the file itself requires a
-- transcoding step no Edge Function can do; when a media-processing worker is
-- added it should key off this column.
-- =============================================================================

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN videos.is_ai_generated IS
  'AI-generation disclosure (§22). All provider-generated battle videos are TRUE; render and share surfaces must show the label when set.';
