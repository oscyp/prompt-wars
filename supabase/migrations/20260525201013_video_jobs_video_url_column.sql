ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN public.video_jobs.video_url IS
  'Playable URL written by process-video-job (or directly by resolve-battle for auto-Tier-1 free reveals). Null until status=succeeded.';
