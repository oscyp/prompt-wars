-- Records WHICH model produced a Tier 1 video.
--
-- video_jobs has carried provider_cost_usd and provider_latency_ms since
-- 20260822191000, and daily_provider_costs has summed them since -- but
-- process-video-job never wrote either, so the video arm of that rollup has
-- read zero for its entire existence. The cost of a cinematic is currently
-- unanswerable from the data, which makes the 100/day global auto-video cap
-- an unpriced decision.
--
-- The model has to be stored alongside the cost, not assumed: XAIVideoProvider
-- picks between XAI_VIDEO_MODEL and XAI_VIDEO_REFERENCE_MODEL depending on
-- whether reference images were sent, and the two are priced separately.
ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS provider_model TEXT;

COMMENT ON COLUMN public.video_jobs.provider_model IS
  'The provider model that actually produced this video. Reference-image jobs run a different (differently priced) model than plain text-to-video.';
