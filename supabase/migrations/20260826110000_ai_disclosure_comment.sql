-- ============================================================================
-- Correct the videos.is_ai_generated comment after the label was removed
-- ============================================================================
--
-- 20260708124000_videos_ai_disclosure.sql documented this column as
--
--     'AI-generation disclosure (§22). ... render and share surfaces must show
--      the label when set.'
--
-- The in-app AI badges were removed on 2026-08-26 by product decision (reveal
-- poster, result card, portrait frame, and the AI-tagged share filename/title),
-- and the corresponding claims on the landing site and in the privacy policy /
-- terms were rewritten so nothing published asserts labeling the app no longer
-- does.
--
-- The column stays: it is a truthful internal record of how an asset was
-- produced, useful for moderation triage and for restoring disclosure if store
-- review asks for it. But a comment instructing render surfaces to show a label
-- they no longer show is exactly the kind of stale instruction that misleads
-- the next reader, so it is corrected here rather than left to rot.
--
-- No data or behaviour change. Idempotent: COMMENT ON is a replace.
-- ============================================================================

COMMENT ON COLUMN public.videos.is_ai_generated IS
  'Internal record that this asset was produced by generative AI. NOT a UI '
  'contract -- the in-app disclosure badges were removed on 2026-08-26. Kept '
  'for moderation triage and so disclosure can be restored if required.';
