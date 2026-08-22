-- =============================================================================
-- Fix handle_new_user search_path regression (signup hard-fail)
-- =============================================================================
-- 20260512120000_harden_new_user_profile_trigger.sql pinned handle_new_user
-- to `SET search_path = ''` with schema-qualified references, because GoTrue
-- executes the auth.users trigger as `supabase_auth_admin`, whose search_path
-- does not include `public`.
--
-- 20260708123000_age_gate_hard_block.sql then CREATE OR REPLACE'd the
-- function to add the §22 age gate — which silently dropped the function-level
-- search_path pin and reverted to an unqualified `INSERT INTO profiles`.
-- Result: `relation "profiles" does not exist` inside the trigger, which
-- aborts the auth.users INSERT — every signup fails with "Database error
-- creating new user" on any database where the auth role's search_path
-- excludes public.
--
-- This migration keeps the age-gate body verbatim and restores the pinned
-- search_path + schema qualification.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- §22 hard block: failed/absent age gate aborts account creation entirely.
  IF COALESCE((NEW.raw_user_meta_data->>'age_confirmed')::BOOLEAN, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'age_gate_failed: account creation requires 18+ confirmation';
  END IF;

  INSERT INTO public.profiles (id, username, display_name, age_confirmed_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Player'),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET age_confirmed_at = COALESCE(profiles.age_confirmed_at, NOW());

  RETURN NEW;
END;
$$;
