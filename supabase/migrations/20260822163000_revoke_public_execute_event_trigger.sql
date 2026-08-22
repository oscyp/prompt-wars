-- ============================================================================
-- Enforce "no PUBLIC EXECUTE" on new functions with a DDL event trigger
-- ============================================================================
--
-- Why an event trigger
-- --------------------
-- PostgreSQL grants EXECUTE to PUBLIC on every newly created function, and
-- `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` does
-- not suppress it here (measured -- see 20260822162000's header for the probe).
-- `anon` and `authenticated` are members of PUBLIC, so without this, any future
-- migration that adds a function without an explicit REVOKE silently re-opens
-- the hole that 20260822150000 closed -- where an unauthenticated caller could
-- execute grant_credits and resolve_battle.
--
-- Relying on every future migration to remember a REVOKE is precisely the
-- assumption that already failed in this codebase. This makes the safe state
-- the default and exposure an explicit, written-down choice.
--
-- Behaviour
-- ---------
-- On CREATE FUNCTION in schema `public`, revoke EXECUTE from PUBLIC.
--
-- Deliberately revokes from PUBLIC ONLY, not from anon/authenticated:
--   * The hole is the implicit PUBLIC grant. Explicit role grants are always
--     written in a migration, i.e. deliberate.
--   * The event also fires for CREATE OR REPLACE, which preserves existing
--     ACLs. Revoking named roles here would silently strip the intentional
--     `GRANT EXECUTE ... TO authenticated` from client-callable functions
--     (get_battle_templates, get_opponent_move_profile, is_blocked,
--     user_can_see_signature_item, get_my_entitlements) every time they were
--     redefined. Revoking only PUBLIC is safe under replace.
--   * A migration that wants a function client-callable still GRANTs after
--     CREATE, and the GRANT runs after this trigger, so it wins.
--
-- Notes:
--   * Aggregates and window functions share the CREATE FUNCTION tag; the
--     REVOKE is valid for them too.
--   * Errors are swallowed per object. A DDL event trigger that raises would
--     abort the migration that fired it, which is a far worse failure mode than
--     one un-revoked function -- and the Stage 9 CI check is the backstop.
--   * `pg_event_trigger_ddl_commands()` is only callable inside an event
--     trigger, so this function is useless outside its trigger context.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP EVENT TRIGGER IF EXISTS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_public_execute_on_new_functions()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  obj RECORD;
BEGIN
  FOR obj IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE object_type IN ('function', 'aggregate', 'procedure')
  LOOP
    -- Only our own schema; never touch extension or platform schemas.
    IF obj.schema_name = 'public' THEN
      BEGIN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', obj.object_identity);
      EXCEPTION WHEN OTHERS THEN
        -- Never abort the DDL that triggered us.
        RAISE WARNING 'Could not revoke PUBLIC EXECUTE on %: %',
          obj.object_identity, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.revoke_public_execute_on_new_functions() IS
  'DDL event trigger body. Strips the implicit PUBLIC EXECUTE grant from '
  'functions created in public, so client access must be granted explicitly.';

DROP EVENT TRIGGER IF EXISTS trg_revoke_public_execute;

CREATE EVENT TRIGGER trg_revoke_public_execute
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'CREATE AGGREGATE', 'CREATE PROCEDURE')
  EXECUTE FUNCTION public.revoke_public_execute_on_new_functions();

-- The trigger body is itself a function created in public, so sweep it and
-- anything else that slipped through before the trigger existed.
DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN (
        'get_battle_templates',
        'get_opponent_move_profile',
        'is_blocked',
        'user_can_see_signature_item'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
  END LOOP;
END $$;
