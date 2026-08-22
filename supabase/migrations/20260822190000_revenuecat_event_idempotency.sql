-- ============================================================================
-- RevenueCat event idempotency (closes an allowance-minting replay)
-- ============================================================================
--
-- The hole
-- --------
-- `revenuecat-webhook` guards against duplicate delivery by looking up
--
--     idempotency_key = 'revenuecat_event_<event.id>'
--
-- in `wallet_transactions` (index.ts:108-118). Nothing ever writes that key --
-- credit grants use a key derived from the transaction id, not the event id --
-- so the lookup never matches and the guard is dead code.
--
-- That is harmless for purchases, which grant_credits() makes idempotent on its
-- own key. It is not harmless for RENEWAL (index.ts:230-258), which has no
-- idempotency of its own and does:
--
--     monthly_video_allowance_used     = 0
--     monthly_round_allowance_used     = 0
--     monthly_full_battle_cap_used     = 0
--
-- Replaying one captured, correctly-signed renewal body therefore resets a
-- subscriber's allowance to zero, as many times as it is replayed. RevenueCat
-- also retries deliveries on non-2xx, so this can fire without an attacker.
--
-- The fix
-- -------
-- A dedicated table keyed on the RevenueCat event id, claimed atomically before
-- ANY mutation. `INSERT ... ON CONFLICT DO NOTHING` makes the claim the
-- serialization point, so two concurrent deliveries of the same event cannot
-- both proceed -- a check-then-act in the function could.
--
-- Kept separate from wallet_transactions on purpose: not every webhook event is
-- a wallet movement (renewals, cancellations and expirations are not), so the
-- ledger is the wrong place to record "this event was seen".
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revenuecat_events (
  event_id     TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.revenuecat_events IS
  'One row per processed RevenueCat webhook event. Claimed before any mutation '
  'so a replayed or retried delivery cannot re-apply it. Service-role only.';

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_received
  ON public.revenuecat_events (received_at DESC);

ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;

-- No policies: server-owned. Explicit deny-all so the intent is visible rather
-- than implied by absence.
DROP POLICY IF EXISTS revenuecat_events_service_only ON public.revenuecat_events;
CREATE POLICY revenuecat_events_service_only ON public.revenuecat_events
  FOR ALL USING (FALSE);

REVOKE ALL ON public.revenuecat_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.revenuecat_events TO service_role;

/**
 * Claim a RevenueCat event. Returns TRUE the first time, FALSE for a replay.
 */
CREATE OR REPLACE FUNCTION public.claim_revenuecat_event(
  p_event_id   TEXT,
  p_event_type TEXT,
  p_profile_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  -- ROW_COUNT is an integer; assigning it to a BOOLEAN raises at call time,
  -- which a clean migration would not reveal.
  v_rows INTEGER;
BEGIN
  IF p_event_id IS NULL OR length(trim(p_event_id)) = 0 THEN
    -- No id to dedupe on. Fail closed: better to reject a malformed event than
    -- to let an unbounded number of unidentifiable ones through.
    RAISE EXCEPTION 'RevenueCat event id is required for idempotency';
  END IF;

  INSERT INTO revenuecat_events (event_id, event_type, profile_id)
  VALUES (p_event_id, p_event_type, p_profile_id)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.claim_revenuecat_event(TEXT, TEXT, UUID) IS
  'Atomically claims a webhook event id. TRUE = process it, FALSE = already '
  'handled. The INSERT is the serialization point, so concurrent duplicate '
  'deliveries cannot both win.';

REVOKE ALL ON FUNCTION public.claim_revenuecat_event(TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_revenuecat_event(TEXT, TEXT, UUID)
  TO service_role;
