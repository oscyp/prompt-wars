-- =============================================================================
-- Schedule background workers via pg_cron + pg_net
-- =============================================================================
--
-- This migration wires periodic invocations of service-role Edge Functions
-- (expire-battles, process-video-job, run-judge-calibration, resolve-appeal)
-- using pg_cron to fire pg_net HTTP POSTs to the Supabase Functions endpoint.
--
-- !!  OPERATOR FOLLOW-UP REQUIRED  !!
-- Before any of these jobs will succeed, two secrets MUST be stored in
-- Supabase Vault (encrypted at rest). Run ONCE per environment (psql
-- connected as the postgres role, or via Supabase Studio SQL editor):
--
--     SELECT vault.create_secret(
--         'https://<project-ref>.supabase.co',
--         'supabase_url',
--         'Base URL for Supabase Functions endpoint (used by pg_cron jobs)'
--     );
--     SELECT vault.create_secret(
--         '<service_role_jwt>',
--         'service_role_key',
--         'Service-role JWT used by pg_cron to invoke protected Edge Functions'
--     );
--
-- To rotate either secret later:
--     SELECT vault.update_secret(
--         (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
--         '<new_service_role_jwt>'
--     );
--
-- The service-role JWT is required because each scheduled Edge Function
-- enforces `hasSupabaseSecretAuthorization()` (i.e. only the service-role
-- secret may invoke them — anon JWTs are rejected with 403).
--
-- Verify scheduled jobs after running this migration with:
--     SELECT jobname, schedule, command FROM cron.job;
-- Verify Vault secrets are readable with:
--     SELECT name FROM vault.decrypted_secrets
--      WHERE name IN ('supabase_url','service_role_key');
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- On Supabase Cloud, pg_cron, pg_net, and supabase_vault live in the
-- `extensions` schema (vault itself lives in the `vault` schema once the
-- supabase_vault extension is enabled). If extension creation fails here
-- (e.g. on a hosted project where the extension must be toggled via the
-- dashboard), enable all three in Supabase Studio → Database → Extensions
-- and re-run this migration.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- internal schema (helper namespace, not exposed via PostgREST)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS internal;

-- ---------------------------------------------------------------------------
-- internal.schedule_edge_function
-- ---------------------------------------------------------------------------
-- Idempotently (re)schedules a cron job that POSTs to a Supabase Edge
-- Function with service-role auth. The function_slug and body are baked
-- into the scheduled command at registration time via format().
CREATE OR REPLACE FUNCTION internal.schedule_edge_function(
  job_name      text,
  schedule      text,
  function_slug text,
  body          jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  cmd text;
BEGIN
  -- Best-effort unschedule of any prior registration so this function is
  -- idempotent across migration re-runs. cron.unschedule raises if the job
  -- does not exist, so we swallow that case.
  BEGIN
    PERFORM cron.unschedule(job_name);
  EXCEPTION WHEN OTHERS THEN
    -- no-op: job did not previously exist
    NULL;
  END;

  -- The scheduled command reads both secrets from Supabase Vault at
  -- invocation time, so rotating the service-role key only requires
  -- vault.update_secret(...) — no need to reschedule jobs.
  cmd := format(
    $cmd$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name = 'supabase_url'
      ) || '/functions/v1/%s',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
           WHERE name = 'service_role_key'
        )
      ),
      body := %L::jsonb
    )
    $cmd$,
    function_slug,
    body::text
  );

  PERFORM cron.schedule(job_name, schedule, cmd);
END;
$fn$;

COMMENT ON FUNCTION internal.schedule_edge_function(text, text, text, jsonb) IS
  'Idempotently registers a pg_cron job that POSTs to a Supabase Edge Function with service-role auth. Reads `supabase_url` and `service_role_key` from Supabase Vault (vault.decrypted_secrets) at job execution time.';

-- ---------------------------------------------------------------------------
-- Register scheduled workers
-- ---------------------------------------------------------------------------

-- Every minute: expire stale battles past their per-phase deadlines.
SELECT internal.schedule_edge_function(
  'expire-battles-every-minute',
  '* * * * *',
  'expire-battles',
  '{}'::jsonb
);

-- Every minute: advance video generation jobs (submit / poll / finalize).
SELECT internal.schedule_edge_function(
  'process-video-job-every-minute',
  '* * * * *',
  'process-video-job',
  '{"batch_size":10}'::jsonb
);

-- Nightly at 03:00 UTC: run blind judge calibration sweep.
SELECT internal.schedule_edge_function(
  'run-judge-calibration-nightly',
  '0 3 * * *',
  'run-judge-calibration',
  '{}'::jsonb
);

-- Every 10 minutes: sweep pending appeals (resolve-appeal supports a batch
-- sweep mode when called without an appeal_id; it processes the oldest
-- pending appeals up to batch_size).
SELECT internal.schedule_edge_function(
  'resolve-appeal-every-10-minutes',
  '*/10 * * * *',
  'resolve-appeal',
  '{"batch_size":10}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Verify with:
--   SELECT jobname, schedule, command FROM cron.job;
-- ---------------------------------------------------------------------------
