-- ============================================================================
-- Stop the entitlement views leaking every player's economy state
-- ============================================================================
--
-- What was wrong
-- --------------
-- Neither `entitlements` nor `entitlements_v2` sets `security_invoker`. Verified
-- live on 2026-08-22: both have `reloptions IS NULL`, and the string
-- "security_invoker" appears nowhere in supabase/.
--
-- A PostgreSQL view without `security_invoker` executes with the privileges of
-- its OWNER, so RLS on the underlying `profiles`, `subscriptions` and
-- `wallet_transactions` tables is bypassed. Both views were SELECT-able by
-- `anon` and `authenticated`, and the only thing scoping the client read to one
-- row was the `.eq('profile_id', user.id)` filter in utils/monetization.ts:104
-- -- a client-side convention, trivially dropped. Any authenticated user could
-- read every player's credit balance, subscription tier, allowance remaining
-- and new-user grant counters.
--
-- CLAUDE.md calls `entitlements` "the source of truth for feature gates", which
-- is exactly why it must not be client-readable.
--
-- The fix
-- -------
--   * Set security_invoker on both views so they stop running as owner.
--   * Revoke SELECT on both from anon and authenticated outright.
--   * Add `get_my_entitlements()`, a SECURITY DEFINER RPC hard-filtered to
--     auth.uid(), as the single client read path.
--
-- Why an RPC rather than just security_invoker: under security_invoker the view
-- body selects `profiles` columns that 20260822152000 no longer grants to
-- `authenticated`, so a direct client read would fail with "permission denied
-- for column" regardless. Routing through a definer function that returns only
-- the caller's row is both the working option and the correct one -- it matches
-- the thin-client invariant in CLAUDE.md.
--
-- Notes:
--   * Edge Functions are unaffected. _shared/entitlement-gate.ts:65 and
--     request-video-upgrade/index.ts:463 read these views as service_role,
--     which bypasses RLS and holds SELECT.
--   * The RPC returns the `entitlements` (v1) shape because that is what
--     utils/monetization.ts getWalletBalance() consumes. entitlements_v2 stays
--     server-only.
--   * Requires the matching client change in the same release: getWalletBalance
--     must call the RPC instead of .from('entitlements').
--
-- Idempotent: ALTER VIEW / REVOKE / CREATE OR REPLACE FUNCTION / GRANT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Views stop running as owner, and stop being client-readable
-- ----------------------------------------------------------------------------

ALTER VIEW public.entitlements    SET (security_invoker = true);
ALTER VIEW public.entitlements_v2 SET (security_invoker = true);

REVOKE ALL ON public.entitlements    FROM anon, authenticated;
REVOKE ALL ON public.entitlements_v2 FROM anon, authenticated;

GRANT SELECT ON public.entitlements    TO service_role;
GRANT SELECT ON public.entitlements_v2 TO service_role;

-- ----------------------------------------------------------------------------
-- 2. The one client read path
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE (
  profile_id                        UUID,
  is_subscriber                     BOOLEAN,
  subscription_tier                 TEXT,
  -- credits_balance is BIGINT, not INTEGER: the view derives it with SUM()
  -- over wallet_transactions. A mismatch here fails at call time with
  -- "structure of query does not match function result type".
  monthly_video_allowance_remaining INTEGER,
  credits_balance                   BIGINT,
  priority_queue                    BOOLEAN,
  cosmetic_unlocks                  JSONB,
  updated_at                        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    e.profile_id,
    e.is_subscriber,
    e.subscription_tier,
    e.monthly_video_allowance_remaining,
    e.credits_balance,
    e.priority_queue,
    e.cosmetic_unlocks,
    e.updated_at
  FROM public.entitlements e
  WHERE e.profile_id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_entitlements() IS
  'Caller-scoped read of the entitlements view. Hard-filtered to auth.uid(); the '
  'view itself is not client-readable. Returns zero rows when unauthenticated.';

REVOKE ALL ON FUNCTION public.get_my_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated, service_role;
