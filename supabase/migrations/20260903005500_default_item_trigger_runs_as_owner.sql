-- ============================================================================
-- characters_assign_default_item must run as its owner, not as the inserter
-- ============================================================================
--
-- 20260827170000 added a BEFORE INSERT trigger on characters that fills a
-- missing signature_item_id via default_signature_item_for(). Both functions
-- were created after the 20260822163000 event trigger, so neither carries
-- EXECUTE for `authenticated` (live ACL: postgres + service_role only), and the
-- migration granted nothing -- correctly, since neither is client-callable.
--
-- But a trigger function runs with the privileges of the role that issued the
-- DML, and the onboarding flow inserts the draft character row from the client
-- as `authenticated`. Every such insert therefore failed with
--   42501: permission denied for function default_signature_item_for
-- which the app surfaced as "Portrait drawing is unavailable". Reproduced on
-- the linked project with `SET ROLE authenticated; SELECT
-- default_signature_item_for(gen_random_uuid());`.
--
-- Fix: run the trigger function as its owner, pinned to schema public, exactly
-- as validate_character_signature_item (the trigger that fires right after it)
-- already does. The body only assigns a catalogue item id from a seeded pick;
-- it exposes nothing, and nothing is granted to any client role.
--
-- Idempotent: ALTER FUNCTION is repeatable.
-- ============================================================================
ALTER FUNCTION public.characters_assign_default_item()
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION public.characters_assign_default_item() IS
  'BEFORE INSERT on characters: assigns a default catalogue signature item when none was chosen. SECURITY DEFINER because the inserting role (authenticated, from onboarding) cannot execute default_signature_item_for and must not need to.';
