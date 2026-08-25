-- ============================================================================
-- Drop the profiles FK on revenuecat_events
-- ============================================================================
--
-- What broke
-- ----------
-- 20260822190000 gave `revenuecat_events.profile_id` a foreign key to
-- `profiles(id)`. A RevenueCat test event carries a synthetic `app_user_id`
-- that has no matching profile, so claiming it failed:
--
--     23503: insert or update on table "revenuecat_events" violates foreign key
--            constraint "revenuecat_events_profile_id_fkey"
--     Key (profile_id)=(bf00fe2d-...) is not present in table "profiles".
--
-- and the webhook returned 500. RevenueCat retries on non-2xx, so a test event
-- -- or any event whose app_user_id is not a local profile -- would retry
-- forever against a constraint that can never be satisfied.
--
-- Why the FK was wrong in principle, not just inconvenient
-- --------------------------------------------------------
-- This table answers one question: "have we already processed this event id?"
-- That fact is true regardless of whether the event's app_user_id maps to a
-- profile we know. `app_user_id` is RevenueCat-controlled data arriving from
-- outside the system, so making it a referential dependency means an unknown
-- external identifier can block us from recording that we received something.
--
-- The claim also has to happen BEFORE any other work for idempotency to mean
-- anything, which puts it strictly earlier than the profile lookup. A
-- constraint requiring the profile to exist is therefore ordered wrong as well
-- as scoped wrong.
--
-- profile_id stays as an informational column: useful when tracing an event,
-- never load-bearing.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS.
-- ============================================================================

ALTER TABLE public.revenuecat_events
  DROP CONSTRAINT IF EXISTS revenuecat_events_profile_id_fkey;

COMMENT ON COLUMN public.revenuecat_events.profile_id IS
  'RevenueCat app_user_id as received. Informational only -- deliberately NOT a '
  'foreign key: the event must be recordable even when the id does not match a '
  'local profile (test events, deleted accounts, misconfiguration).';
