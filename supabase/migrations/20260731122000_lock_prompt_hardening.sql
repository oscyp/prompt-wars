-- =============================================================================
-- lock_prompt hardening
-- =============================================================================
-- Postgres grants EXECUTE on functions to the implicit PUBLIC role by default,
-- and Supabase exposes every public-schema function to the anon/authenticated
-- roles through PostgREST (`POST /rest/v1/rpc/<fn>`). `lock_prompt` is
-- SECURITY DEFINER and trusts its `p_profile_id` argument, so leaving it
-- client-callable would let any authenticated user lock a prompt on behalf of
-- an arbitrary profile, bypassing the moderation pipeline that runs in the
-- `submit-prompt` Edge Function (its only legitimate caller, via service
-- role). Same posture as 20260619123000_economy_function_hardening.sql.
--
-- REVOKE/GRANT are idempotent, so this migration is safe to (re)apply on top
-- of existing deployments.
-- =============================================================================

REVOKE ALL ON FUNCTION lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION lock_prompt(UUID, UUID, UUID, TEXT, move_type, moderation_status) TO service_role;
