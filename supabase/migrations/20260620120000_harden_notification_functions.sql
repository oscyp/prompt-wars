-- =============================================================================
-- Harden notification gating functions
-- =============================================================================
-- `log_notification_send` is SECURITY DEFINER and was callable by anon/
-- authenticated via PostgREST (the implicit PUBLIC grant), letting any client
-- insert notification_sends rows for an ARBITRARY profile id. Because soft
-- categories are capped at 2/day, an attacker could log fake sends for a victim
-- to suppress their opponent_submitted / video_ready / daily_quest pushes for
-- the day (result_ready always sends, so this is griefing, not a full block).
--
-- These functions are only ever called by the service-role push dispatcher
-- (supabase/functions/_shared/push.ts). Lock both to service_role, consistent
-- with the economy-function hardening. REVOKE/GRANT are idempotent.
-- =============================================================================

REVOKE ALL ON FUNCTION log_notification_send(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION can_send_notification(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION log_notification_send(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION can_send_notification(UUID, TEXT) TO service_role;
