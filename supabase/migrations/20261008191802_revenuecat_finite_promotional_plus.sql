-- RevenueCat dashboard/API promotional entitlements are real provider grants,
-- not store purchases. Keep their finite Plus access in the existing subscription
-- mirror; never synthesize purchase or credit ledger entries.
-- Docs: https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile#granted-entitlements
--       https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS revenuecat_promotional_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_promotional_transaction_unique
  ON public.subscriptions (revenuecat_promotional_transaction_id)
  WHERE revenuecat_promotional_transaction_id IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.revenuecat_promotional_transaction_id IS
  'Actual RevenueCat transaction_id for a validated finite PROMOTIONAL Plus grant. NULL for store-paid subscriptions; original_transaction_id remains revenuecat_subscription_id.';

CREATE OR REPLACE FUNCTION internal.process_revenuecat_promotion(p_event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
SET timezone = 'UTC'
AS $$
DECLARE
  v_type TEXT := p_event->>'type';
  v_product TEXT := p_event->>'product_id';
  v_transaction TEXT := p_event->>'transaction_id';
  v_original TEXT := p_event->>'original_transaction_id';
  v_profile_id UUID;
  v_sub public.subscriptions%ROWTYPE;
  v_purchased_at TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
  v_event_at TIMESTAMPTZ;
  v_terminal BOOLEAN := v_type IN ('CANCELLATION', 'EXPIRATION');
  v_plus_evidence BOOLEAN := COALESCE(jsonb_typeof(p_event->'entitlement_ids') = 'array'
    AND (p_event->'entitlement_ids') @> '["plus"]'::JSONB, FALSE);
  v_source_evidence BOOLEAN := COALESCE(p_event->>'store' = 'PROMOTIONAL', FALSE);
BEGIN
  -- The product prefix alone is never evidence of an entitlement. RevenueCat
  -- documents these exact source fields and emits grants in PRODUCTION only.
  -- Other promotional entitlements and unsupported event types are acknowledged
  -- without a claim or mutation, like other unhandled RevenueCat products.
  IF NOT COALESCE(
    left(v_product, 9) = 'rc_promo_'
    AND (v_source_evidence OR (v_terminal AND p_event->>'store' IS NULL))
    AND p_event->>'period_type' = 'PROMOTIONAL'
    AND p_event->>'environment' = 'PRODUCTION'
    AND (v_plus_evidence OR v_terminal)
    AND v_type IN ('NON_RENEWING_PURCHASE', 'CANCELLATION', 'EXPIRATION'), FALSE)
  THEN
    RETURN jsonb_build_object('processed', TRUE, 'action', 'ignored', 'event_type', v_type);
  END IF;

  IF jsonb_typeof(p_event->'id') IS DISTINCT FROM 'string'
     OR NULLIF(btrim(p_event->>'id'), '') IS NULL
     OR jsonb_typeof(p_event->'transaction_id') IS DISTINCT FROM 'string'
     OR NULLIF(btrim(v_transaction), '') IS NULL
     OR jsonb_typeof(p_event->'original_transaction_id') IS DISTINCT FROM 'string'
     OR NULLIF(btrim(v_original), '') IS NULL THEN
    RAISE EXCEPTION 'Promotional event and provider transaction identities are required';
  END IF;

  BEGIN
    v_profile_id := (p_event->>'app_user_id')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_profile_id := NULL;
  END;
  IF v_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_profile_id) THEN
    RETURN jsonb_build_object('processed', FALSE, 'action', 'ignored_unknown_profile');
  END IF;

  -- Do not invent a grant period, accept lifetime access or coerce string dates.
  IF jsonb_typeof(p_event->'purchased_at_ms') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_event->'event_timestamp_ms') IS DISTINCT FROM 'number'
     OR (p_event->>'purchased_at_ms')::NUMERIC <= 0
     OR (p_event->>'event_timestamp_ms')::NUMERIC <= 0 THEN
    RAISE EXCEPTION 'Promotional provider timestamps are required';
  END IF;
  v_purchased_at := to_timestamp((p_event->>'purchased_at_ms')::DOUBLE PRECISION / 1000);
  v_event_at := to_timestamp((p_event->>'event_timestamp_ms')::DOUBLE PRECISION / 1000);
  IF NOT isfinite(v_purchased_at) OR NOT isfinite(v_event_at) THEN
    RAISE EXCEPTION 'Promotional provider timestamps must be finite';
  END IF;
  IF p_event->'expiration_at_ms' IS NOT NULL AND p_event->'expiration_at_ms' <> 'null'::JSONB THEN
    IF jsonb_typeof(p_event->'expiration_at_ms') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Promotional expiration must be a finite provider timestamp';
    END IF;
    v_expires := to_timestamp((p_event->>'expiration_at_ms')::DOUBLE PRECISION / 1000);
    IF NOT isfinite(v_expires) OR v_expires < v_purchased_at THEN
      RAISE EXCEPTION 'Promotional expiration must follow purchased_at_ms';
    END IF;
  END IF;
  IF NOT v_terminal AND (v_expires IS NULL OR v_expires <= v_purchased_at) THEN
    RAISE EXCEPTION 'Promotional expiration must follow purchased_at_ms';
  END IF;

  -- Claim and mirror writes share one transaction. Existing wallet serialization
  -- coordinates with paid fulfillment; uniqueness also fences different profiles
  -- racing to claim the same real transaction or original transaction.
  IF NOT public.claim_revenuecat_event(p_event->>'id', v_type, v_profile_id) THEN
    RETURN jsonb_build_object('processed', TRUE, 'duplicate', TRUE);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('revenuecat-transaction:' || v_transaction, 0));
  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_profile_id::TEXT));
  SELECT * INTO v_sub FROM public.subscriptions
  WHERE revenuecat_subscription_id = v_original FOR UPDATE;
  IF v_sub.id IS NOT NULL AND (
    v_sub.profile_id <> v_profile_id OR v_sub.product_id <> v_product
    OR v_sub.revenuecat_promotional_transaction_id IS DISTINCT FROM v_transaction
  ) THEN
    RAISE EXCEPTION 'Promotion belongs to a different profile, product or provider transaction';
  END IF;
  IF EXISTS (SELECT 1 FROM public.purchases WHERE revenuecat_transaction_id = v_transaction) THEN
    RAISE EXCEPTION 'Promotional transaction is already recorded as a store purchase';
  END IF;

  IF v_sub.id IS NULL THEN
    -- RevenueCat documents nullable entitlement_ids and optional store on
    -- lifecycle events. Existing validated identity supplies that evidence;
    -- unknown identities must retain retryability instead of losing revocation.
    IF NOT v_plus_evidence OR NOT v_source_evidence THEN
      RAISE EXCEPTION 'Promotional Plus identity has not been received';
    END IF;
    IF v_expires IS NULL THEN
      -- A terminal event without a period can use an existing finite grant, but
      -- cannot invent one. A retried webhook can recover after activation.
      RAISE EXCEPTION 'Promotional activation or finite expiration has not been received';
    END IF;
    INSERT INTO public.subscriptions (
      profile_id, revenuecat_subscription_id, revenuecat_promotional_transaction_id,
      product_id, status, tier, starts_at, expires_at, canceled_at,
      allowance_anchor_at, allowance_reset_at, revenuecat_event_at,
      monthly_video_allowance, monthly_round_allowance, monthly_full_battle_cap
    ) VALUES (
      v_profile_id, v_original, v_transaction, v_product,
      CASE WHEN v_terminal THEN 'expired' ELSE 'active' END, 'plus',
      v_purchased_at, v_expires, CASE WHEN v_type = 'CANCELLATION' THEN v_event_at END,
      v_purchased_at, internal.next_subscription_allowance_reset(
        v_purchased_at, v_expires, GREATEST(v_purchased_at, NOW())), v_event_at, 30, 90, 30
    );
  ELSIF v_terminal THEN
    -- Promo revocation removes access immediately. Generic paid 'canceled'
    -- intentionally retains paid-through access and must not be used here.
    -- A grant cannot renew: terminal state wins even against delayed activation.
    UPDATE public.subscriptions
    SET status = 'expired', expires_at = LEAST(expires_at, COALESCE(v_expires, expires_at)),
        canceled_at = CASE WHEN v_type = 'CANCELLATION' THEN v_event_at ELSE canceled_at END,
        revenuecat_event_at = GREATEST(revenuecat_event_at, v_event_at), updated_at = NOW()
    WHERE id = v_sub.id;
  END IF;
  -- Another event ID for the same grant cannot reset counters, extend its period
  -- or revive a terminal grant. RevenueCat extensions are separate new grants.
  RETURN jsonb_build_object('processed', TRUE, 'type',
    CASE WHEN v_terminal THEN 'promotional_plus_expired' ELSE 'promotional_plus_activated' END);
END;
$$;

REVOKE ALL ON FUNCTION internal.process_revenuecat_promotion(JSONB) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO service_role;
GRANT EXECUTE ON FUNCTION internal.process_revenuecat_promotion(JSONB) TO service_role;

-- Preserve the installed paid/credit/FTUO fulfillment body verbatim apart from
-- dispatching promotional candidates and rejecting cross-origin identities.
-- Guard the expected anchors so an unexpected deployed definition fails closed.
DO $migration$
DECLARE
  definition TEXT := replace(pg_get_functiondef('public.process_revenuecat_event(jsonb)'::REGPROCEDURE), E'\r\n', E'\n');
  anchor TEXT := '  v_subscription := v_base_product IN (''promptwars_plus_monthly'', ''promptwars_plus_annual'');';
  identity_anchor TEXT := E'    IF FOUND AND v_sub.profile_id <> v_profile_id THEN';
  purchase_anchor TEXT := E'  INSERT INTO public.purchases (';
  lock_anchor TEXT := '  PERFORM pg_advisory_xact_lock(hashtext(''wallet:'' || v_profile_id::TEXT));';
BEGIN
  IF position('internal.process_revenuecat_promotion(p_event)' IN definition) = 0 THEN
    IF position(anchor IN definition) = 0 OR position(identity_anchor IN definition) = 0
       OR position(purchase_anchor IN definition) = 0 OR position(lock_anchor IN definition) = 0 THEN
      RAISE EXCEPTION 'Unexpected RevenueCat fulfillment definition';
    END IF;
    definition := replace(definition, anchor, $dispatch$
  IF left(v_product, 9) = 'rc_promo_' OR p_event->>'store' = 'PROMOTIONAL'
     OR p_event->>'period_type' = 'PROMOTIONAL' THEN
    RETURN internal.process_revenuecat_promotion(p_event);
  END IF;
$dispatch$ || anchor);
    definition := replace(definition, identity_anchor,
      E'    IF FOUND AND v_sub.revenuecat_promotional_transaction_id IS NOT NULL THEN\n'
      || E'      RAISE EXCEPTION ''Store subscription identity belongs to a promotional grant'';\n'
      || E'    END IF;\n' || identity_anchor);
    definition := replace(definition, purchase_anchor,
      E'  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE revenuecat_promotional_transaction_id = v_transaction) THEN\n'
      || E'    RAISE EXCEPTION ''Store purchase transaction belongs to a promotional grant'';\n'
      || E'  END IF;\n\n' || purchase_anchor);
    -- Purchases and promotional mirrors use separate tables. Lock the real
    -- provider transaction before the shared wallet lock in BOTH paths so a
    -- cross-profile, cross-origin race cannot pass both existence checks.
    definition := replace(definition, lock_anchor,
      E'  PERFORM pg_advisory_xact_lock(hashtextextended(''revenuecat-transaction:'' || v_transaction, 0));\n'
      || lock_anchor);
    EXECUTE definition;
  END IF;
END;
$migration$;

-- Finite grants longer than a month receive the same monthly allowance schedule
-- as annual Plus. The existing scheduler and expiry cap remain authoritative.
CREATE OR REPLACE FUNCTION internal.reset_subscription_allowances(
  p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.subscriptions
  SET monthly_video_allowance_used = 0,
      monthly_round_allowance_used = 0,
      monthly_full_battle_cap_used = 0,
      allowance_reset_at = internal.next_subscription_allowance_reset(
        COALESCE(allowance_anchor_at, starts_at), expires_at, p_at),
      updated_at = NOW()
  WHERE status IN ('active', 'canceled')
    AND expires_at > p_at
    AND (split_part(product_id, ':', 1) = 'promptwars_plus_annual'
      OR revenuecat_promotional_transaction_id IS NOT NULL)
    AND allowance_reset_at <= p_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.process_revenuecat_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_revenuecat_event(JSONB) TO service_role;
REVOKE ALL ON FUNCTION internal.reset_subscription_allowances(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.reset_subscription_allowances(TIMESTAMPTZ) TO service_role;
