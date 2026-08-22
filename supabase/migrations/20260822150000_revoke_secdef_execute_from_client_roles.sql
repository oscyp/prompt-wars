-- ============================================================================
-- Revoke SECURITY DEFINER EXECUTE from anon/authenticated; pin search_path
-- ============================================================================
--
-- What was wrong
-- --------------
-- Every SECURITY DEFINER function in `public` was executable by BOTH `anon`
-- and `authenticated` on the live project. Verified against the linked
-- database on 2026-08-22:
--
--   grant_credits(uuid,integer,text,text,uuid,uuid,jsonb)   anon=X authenticated=X
--   spend_credits(uuid,integer,text,text,uuid,uuid,jsonb)   anon=X authenticated=X
--   resolve_battle(uuid,uuid,boolean,jsonb,jsonb,text,...)  anon=X authenticated=X
--
-- Because `anon` is the publishable key bundled into the shipped mobile app,
-- minting currency or declaring a battle winner required no account at all.
--
-- Why the existing hardening did not work
-- ---------------------------------------
-- 20260619123000, 20260620120000, 20260708121000 and 20260731130000 all end
-- with `REVOKE ALL ON FUNCTION ... FROM PUBLIC`. That removes only the PUBLIC
-- pseudo-role grant (the `=X/postgres` ACL entry). It does NOT remove explicit
-- per-role grants.
--
-- The explicit grants come from `pg_default_acl`: schema `public` carries a
-- default ACL for functions of
--     postgres=X/postgres | anon=X/postgres | authenticated=X/postgres
-- so every function CREATEd by a migration is granted to anon + authenticated
-- at creation time. Revoking FROM PUBLIC afterwards never touched them.
-- Every REVOKE in this repo has therefore been a no-op against the real
-- exposure since the beginning.
--
-- The fix
-- -------
--   * REVOKE EXECUTE on all SECURITY DEFINER functions in `public` from
--     PUBLIC, anon and authenticated -- naming the roles explicitly this time.
--   * Re-grant EXECUTE to service_role (Edge Functions call these).
--   * Re-grant EXECUTE to authenticated for the only four the client legitimately
--     needs (enumerated below).
--   * ALTER DEFAULT PRIVILEGES so functions created by future migrations do not
--     inherit the anon/authenticated grant again.
--   * Pin `search_path` on the SECURITY DEFINER functions still missing it
--     (40 of 44), closing the search-path injection class in the same pass.
--
-- The four functions that stay client-callable, and why:
--   get_battle_templates        called from utils/battles.ts
--   get_opponent_move_profile   called from app/(battle)/prompt-entry.tsx
--   is_blocked                  called from utils/safety.ts
--   user_can_see_signature_item evaluated INSIDE the RLS policy
--                               signature_items_select_opponent_open_battle,
--                               so the querying role needs EXECUTE on it
-- `anon` needs none of them: every client RPC happens after authentication.
--
-- Notes:
--   * Scoped to SECURITY DEFINER functions only. Non-SECURITY-DEFINER functions
--     run with the caller's own privileges and RLS still applies to them, so they
--     are not a privilege-escalation surface. Auditing that remainder is
--     deliberately left to a follow-up so this migration stays reviewable.
--   * Trigger functions are unaffected: PostgreSQL checks EXECUTE on a trigger
--     function at CREATE TRIGGER time, not when the trigger fires.
--   * search_path is pinned to `public, extensions` rather than bare `public`
--     so function bodies referencing extension-schema helpers keep resolving.
--     pg_catalog is always searched first implicitly, and a caller cannot
--     prepend a schema, which is the property we need.
--   * ALTER DEFAULT PRIVILEGES only affects the grantor that ran it. Migrations
--     run as `postgres`, and the postgres-owned default ACL is the one that has
--     been granting these, so altering it here is sufficient. The parallel
--     supabase_admin-owned default ACL is platform-managed and out of scope.
--
-- Idempotent: REVOKE/GRANT and ALTER FUNCTION are all safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Close the door on every SECURITY DEFINER function in public
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Re-open only what the client genuinely calls
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_battle_templates',
        'get_opponent_move_profile',
        'is_blocked',
        'user_can_see_signature_item'
      ])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Stop future functions inheriting the grant
-- ----------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Pin search_path on SECURITY DEFINER functions that lack it
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions', fn.sig);
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS
  'Standard public schema. EXECUTE on SECURITY DEFINER functions is restricted to '
  'service_role; see 20260822150000_revoke_secdef_execute_from_client_roles.sql '
  'before granting any function to anon or authenticated.';
