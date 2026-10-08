-- Leases for the Tier 1 video worker.
--
-- Why this exists:
--   process-video-job selects jobs purely by STATUS and has no claim of any
--   kind. Both the minute cron and the immediate kick from _shared/auto-video
--   can therefore pick up the same `queued` row and both submit it to xAI --
--   two provider charges, and the second's provider_job_id UPDATE orphans the
--   first, so the first is never polled and never cleaned up. That is a live
--   money leak that leaves no trace in the data.
--
--   It becomes far more likely the moment the worker polls inline, because a
--   worker then holds a job for ~100s instead of ~1s. So the claim lands
--   FIRST, and inline polling is built on top of it.
--
-- Claiming alone is not enough: the worker must also be FENCED. A worker whose
-- lease lapsed mid-flight (slow provider, cold start) would otherwise still
-- write its terminal result over the newer worker's. Every terminal write
-- therefore carries the lease token -- see release/renew below and the
-- `.eq('lease_token', token)` guards in the worker.
--
-- Modelled on claim_independent_appeal (20260913183224_durable_independent_appeals).

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.video_jobs.lease_token IS
  'Worker claim token. Every terminal write is fenced on this so a lapsed worker cannot overwrite a newer one.';
COMMENT ON COLUMN public.video_jobs.lease_expires_at IS
  'When the claim lapses and another worker may take the job. Refreshed on each poll rather than taken long up front.';

-- Partial index over exactly the rows the worker sweeps.
CREATE INDEX IF NOT EXISTS idx_video_jobs_claimable
  ON public.video_jobs (created_at)
  WHERE status IN ('queued', 'submitted', 'processing');

-- ---------------------------------------------------------------------------
-- claim_video_jobs
--
-- Returns SETOF video_jobs rather than RETURNS TABLE(...) deliberately: a
-- TABLE signature demands exact type equality column by column, and this repo
-- has already lost a day to a SMALLINT column declared INTEGER (see
-- 20260822183000). SETOF tracks the table and cannot drift from it.
--
-- FOR UPDATE SKIP LOCKED plus the lease predicate means two concurrent
-- workers partition the queue instead of fighting over its head.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_video_jobs(
  p_token UUID,
  p_job_ids UUID[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 120,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS SETOF public.video_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.video_jobs AS vj
  SET lease_token = p_token,
      lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
      updated_at = now()
  WHERE vj.id IN (
    SELECT c.id
    FROM public.video_jobs AS c
    WHERE (c.lease_token IS NULL OR c.lease_expires_at IS NULL OR c.lease_expires_at < now())
      -- The attempt cap gates re-SUBMISSION only. submitted/processing jobs
      -- must stay claimable on the final attempt too, or a stuck job would
      -- never be polled again and its hard timeout could never fire.
      AND (
        (c.status = 'queued' AND c.attempt_count < p_max_attempts)
        OR c.status IN ('submitted', 'processing')
      )
      AND (p_job_ids IS NULL OR c.id = ANY(p_job_ids))
    ORDER BY c.created_at
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING vj.*;
$$;

-- Heartbeat. Short leases refreshed often, rather than one lease long enough
-- to cover a whole poll budget: a long lease would push a CRASHED worker's
-- recovery past TIER1_HARD_TIMEOUT_S, turning a crash into a refunded failure
-- instead of the retry it should be.
CREATE OR REPLACE FUNCTION public.renew_video_job_lease(
  p_job_id UUID,
  p_token UUID,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_renewed BOOLEAN;
BEGIN
  UPDATE public.video_jobs
  SET lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
      updated_at = now()
  WHERE id = p_job_id
    AND lease_token = p_token
  RETURNING TRUE INTO v_renewed;

  -- FALSE means the lease was stolen while we worked. The caller must stop
  -- rather than write anything further.
  RETURN COALESCE(v_renewed, FALSE);
END;
$$;

-- Yielding the job back voluntarily (budget exhausted, too many transient
-- poll errors). Leaves status untouched so the cron resumes it normally.
CREATE OR REPLACE FUNCTION public.release_video_job_lease(
  p_job_id UUID,
  p_token UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.video_jobs
  SET lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_job_id
    AND lease_token = p_token;
$$;

-- Default-closed: schema public's default ACL grants EXECUTE to anon and
-- authenticated on every new function, and the ddl_command_end event trigger
-- strips PUBLIC at CREATE time -- but an explicit grant is still the only
-- thing that makes these callable by the worker.
REVOKE ALL ON FUNCTION public.claim_video_jobs(UUID, UUID[], INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_jobs(UUID, UUID[], INTEGER, INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.renew_video_job_lease(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_video_job_lease(UUID, UUID, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_video_job_lease(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_video_job_lease(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.claim_video_jobs(UUID, UUID[], INTEGER, INTEGER, INTEGER) IS
  'Atomically leases claimable Tier 1 video jobs to one worker. Service-role only.';
COMMENT ON FUNCTION public.renew_video_job_lease(UUID, UUID, INTEGER) IS
  'Heartbeats a held lease. Returns FALSE when the lease was lost, meaning the caller must stop writing.';
COMMENT ON FUNCTION public.release_video_job_lease(UUID, UUID) IS
  'Voluntarily yields a claim without changing job status, so the cron resumes the job normally.';
