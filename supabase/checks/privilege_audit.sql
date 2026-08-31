-- Privilege regression check.
--
-- Run against any environment:
--   supabase db query --linked "$(cat supabase/checks/privilege_audit.sql)"
--
-- Every row returned is a defect. Empty result = healthy.
--
-- This exists because the original holes were invisible from the migrations.
-- Every hardening migration in this repo wrote `REVOKE ... FROM PUBLIC`, which
-- does not remove explicit per-role grants, while schema `public`'s default ACL
-- kept granting anon/authenticated on every new function. The migrations read
-- as correct for months while `anon` -- the key bundled in the shipped app --
-- could execute grant_credits and resolve_battle. Only the live catalog told
-- the truth, so check the live catalog.

-- 1. SECURITY DEFINER functions reachable by client roles.
--    Only these may be: two client RPCs plus one evaluated inside an RLS
--    policy (user_can_see_signature_item), where the querying role needs
--    EXECUTE. get_my_entitlements is authenticated-only by design.
--    (get_battle_templates was dropped with the static template library.)
SELECT 'secdef_function_exposed' AS defect,
       p.oid::regprocedure::text  AS object,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'anon' ELSE 'authenticated' END AS role
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  AND p.proname NOT IN (
    'get_opponent_move_profile',
    'is_blocked',
    'user_can_see_signature_item',
    'get_my_entitlements'
  )

UNION ALL

-- 2. Any function at all executable by anon. anon runs pre-authentication;
--    nothing in this product needs that.
SELECT 'anon_function_execute',
       p.oid::regprocedure::text,
       'anon'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')

UNION ALL

-- 3. Write privileges held by client roles. TRUNCATE matters most: RLS does
--    NOT apply to it, so no policy can compensate.
SELECT 'client_write_grant',
       g.table_name || ' [' || g.privilege_type || ']',
       g.grantee
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'authenticated')
  AND g.privilege_type IN ('DELETE','TRUNCATE','REFERENCES','TRIGGER')

UNION ALL

-- 4. Views without security_invoker run as their OWNER and bypass RLS on every
--    base table. This is how the entitlement views leaked every player's
--    credit balance and subscription tier.
--
--    One deliberate exception, listed here rather than tolerated as a standing
--    row: this check is only useful while an empty result means "clean", and a
--    permanent known-defect row teaches people to skim past it.
--
--    `public_player_cosmetics` is owner-rights ON PURPOSE. Cosmetics are worn to
--    be seen, they live on `characters` (select-own), and the leaderboard has no
--    service-role composer to route them through. The alternative -- a
--    permissive policy on `characters` -- is strictly worse: RLS applies to the
--    whole row, so it would expose names, battle cries, traits, prompts and
--    seeds to read a decoration. The view's safety rests entirely on its
--    projection being two harmless columns, so the guard below asserts exactly
--    that: if anybody widens it, this check fires again.
SELECT 'view_missing_security_invoker',
       c.relname,
       'owner-rights'
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND COALESCE(array_to_string(c.reloptions, ','), '') NOT LIKE '%security_invoker=true%'
  AND c.relname <> 'public_player_cosmetics'

UNION ALL

-- 4b. ...and the exception above is only safe while its projection stays
--     minimal. Any column beyond (profile_id, cosmetic_config) is a defect.
SELECT 'public_cosmetics_view_widened',
       string_agg(a.attname, ',' ORDER BY a.attnum),
       'owner-rights view must expose only profile_id, cosmetic_config'
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public'
  AND c.relname = 'public_player_cosmetics'
HAVING string_agg(a.attname, ',' ORDER BY a.attnum) <> 'profile_id,cosmetic_config'

UNION ALL

-- 5. SECURITY DEFINER functions without a pinned search_path are open to
--    search-path injection by the caller.
SELECT 'secdef_missing_search_path',
       p.oid::regprocedure::text,
       'unpinned'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND p.proconfig IS NULL

ORDER BY 1, 2;
