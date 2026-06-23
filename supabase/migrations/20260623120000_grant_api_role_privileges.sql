-- Grant API-role privileges on the public schema.
--
-- Why this is needed:
--   This project's tables are created by the `postgres` role during migrations.
--   Under the current Supabase default privileges, tables owned by `postgres`
--   grant the API roles (anon / authenticated / service_role) only
--   TRUNCATE / REFERENCES / TRIGGER — NOT SELECT / INSERT / UPDATE / DELETE.
--   The schema migrations never granted table privileges explicitly (only
--   function EXECUTE grants), so on a fresh database the Edge Functions
--   (service_role) and the mobile client (authenticated) get
--   "permission denied for table ...". This migration restores the standard
--   Supabase posture: base privileges on every public table + RLS as the gate.
--
-- Security model:
--   * service_role  — full DML (it bypasses RLS; Edge Functions only).
--   * authenticated — full DML, but every access is gated by RLS policies.
--   * anon          — SELECT only, gated by RLS (enables future public-read
--                     policies such as leaderboards; current policies key off
--                     auth.uid() which is NULL for anon, so anon sees nothing).
--   Function privileges are intentionally left untouched so the economy
--   hardening (REVOKE ... FROM PUBLIC for grant_credits / spend_credits /
--   refund_credits / update_daily_login_streak) is preserved. service_role
--   keeps EXECUTE via the explicit grants in 20260619123000.
--
-- All statements are idempotent and safe to re-apply.

--------------------------------------------------------------------------------
-- Close the two RLS gaps so blanket grants cannot expose server-only data.
--------------------------------------------------------------------------------

-- Server-only idempotency ledger. No client policies => deny-all to anon /
-- authenticated; service_role bypasses RLS.
ALTER TABLE provider_callbacks ENABLE ROW LEVEL SECURITY;

-- Auto-generated video captions. Participants may read captions for their own
-- battle's approved videos (mirrors the videos_select_own_battles policy);
-- writes remain server-only (no INSERT/UPDATE/DELETE policy).
ALTER TABLE video_captions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_captions_select_participant ON video_captions;
CREATE POLICY video_captions_select_participant ON video_captions FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM videos v
    JOIN battles b ON b.id = v.battle_id
    WHERE v.id = video_captions.video_id
      AND v.moderation_status = 'approved'
      AND (b.player_one_id = auth.uid() OR b.player_two_id = auth.uid())
  )
);

--------------------------------------------------------------------------------
-- Schema usage
--------------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- Privileges on EXISTING objects
--------------------------------------------------------------------------------

-- service_role: full access (bypasses RLS but still needs table grants).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated: full DML, gated by RLS policies.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- anon: read-only, gated by RLS.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

--------------------------------------------------------------------------------
-- Default privileges for FUTURE objects created by the migration runner
-- (postgres). Keeps later migrations from reintroducing the permission gap.
--------------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon;
