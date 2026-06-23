-- =============================================================================
-- Economy function hardening
-- =============================================================================
-- Postgres grants EXECUTE on functions to the implicit PUBLIC role by default,
-- and Supabase exposes every public-schema function to the anon/authenticated
-- roles through PostgREST (`POST /rest/v1/rpc/<fn>`). The credit-economy
-- mutators below are SECURITY DEFINER and trust their `p_profile_id` argument,
-- so leaving them callable by clients would let any authenticated user mint or
-- drain credits for an arbitrary profile.
--
-- These functions are only ever invoked by service-role Edge Functions (and by
-- other SECURITY DEFINER functions, which run as the owner and are unaffected
-- by this REVOKE). The sole DB function the mobile client calls directly via
-- rpc is `is_blocked`, which is intentionally left untouched.
--
-- REVOKE/GRANT are idempotent, so this migration is safe to (re)apply on top of
-- existing deployments.
-- =============================================================================

REVOKE ALL ON FUNCTION grant_credits(UUID, INTEGER, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION spend_credits(UUID, INTEGER, TEXT, TEXT, UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION refund_credits(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION update_daily_login_streak(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION grant_credits(UUID, INTEGER, TEXT, TEXT, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION spend_credits(UUID, INTEGER, TEXT, TEXT, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION refund_credits(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION update_daily_login_streak(UUID) TO service_role;
