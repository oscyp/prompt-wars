-- ============================================================================
-- Guarantee an account_abuse_signals row exists for every profile
-- ============================================================================
--
-- The gap
-- -------
-- `get_first_time_offer()` decides eligibility with:
--
--     SELECT COALESCE(bool_or(is_flagged_suspicious), FALSE)
--     FROM account_abuse_signals WHERE profile_id = p_profile_id;
--
-- `bool_or` over ZERO rows is NULL, coalesced to FALSE -- so a profile with no
-- signals row reads as "clean and eligible". The same shape applies to the
-- signup-velocity check right below it.
--
-- The row is only created when the account-farm guard runs, and that is invoked
-- from the CLIENT (app/(onboarding)/create-character.tsx) with its result
-- discarded. A scripted signup that never calls it therefore has no row at all,
-- and sails through both checks to collect the first-time-offer credits and its
-- exclusive cosmetic -- the precise thing those checks exist to stop.
--
-- Absence of evidence was being treated as evidence of absence.
--
-- The fix
-- -------
-- Create the row when the profile is created, so "no signals" is impossible and
-- the checks always evaluate against a real record. Velocity counters stay NULL
-- until the guard populates them; `is_flagged_suspicious` defaults FALSE, so an
-- honest signup is unaffected.
--
-- This does not make the guard server-side by itself -- that is a separate
-- change in finalize-character-creation -- but it removes the "no row" bypass,
-- which is the part that requires no attacker sophistication at all.
--
-- Backfills existing profiles so the invariant holds retroactively.
--
-- Idempotent: ON CONFLICT DO NOTHING + CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================================

INSERT INTO public.account_abuse_signals (profile_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.account_abuse_signals s ON s.profile_id = p.id
WHERE s.profile_id IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.profiles_ensure_abuse_signals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO account_abuse_signals (profile_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_ensure_abuse_signals ON public.profiles;

CREATE TRIGGER trg_profiles_ensure_abuse_signals
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_ensure_abuse_signals();
