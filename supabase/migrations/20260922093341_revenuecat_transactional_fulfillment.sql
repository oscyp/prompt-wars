-- Commit the RevenueCat event claim and its fulfillment together. Any error
-- rolls everything back, so a signed retry can recover without double grants.
-- Deploy this migration before deploying revenuecat-webhook.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS revenuecat_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allowance_anchor_at TIMESTAMPTZ;

CREATE SCHEMA IF NOT EXISTS internal;

-- Calculate from the original day, rather than adding months repeatedly:
-- Jan 31 -> Feb 28 -> Mar 31. The store expiration always caps the allowance.
CREATE OR REPLACE FUNCTION internal.next_subscription_allowance_reset(
  p_anchor TIMESTAMPTZ, p_expires TIMESTAMPTZ, p_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
SET timezone = 'UTC'
AS $$
DECLARE
  v_months INTEGER;
  v_next TIMESTAMPTZ;
BEGIN
  v_months := GREATEST(1,
    (EXTRACT(YEAR FROM p_at)::INTEGER - EXTRACT(YEAR FROM p_anchor)::INTEGER) * 12
    + EXTRACT(MONTH FROM p_at)::INTEGER - EXTRACT(MONTH FROM p_anchor)::INTEGER);
  v_next := p_anchor + make_interval(months => v_months);
  IF v_next <= p_at THEN
    v_next := p_anchor + make_interval(months => v_months + 1);
  END IF;
  RETURN LEAST(v_next, p_expires);
END;
$$;

-- Repair existing annual reset dates without fabricating any new paid period.
UPDATE public.subscriptions
SET allowance_anchor_at = starts_at,
    allowance_reset_at = CASE
      WHEN split_part(product_id, ':', 1) = 'promptwars_plus_annual' THEN
        LEAST(allowance_reset_at,
          internal.next_subscription_allowance_reset(starts_at, expires_at, starts_at))
      ELSE allowance_reset_at
    END
WHERE allowance_anchor_at IS NULL;

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
  -- One conditional UPDATE locks and rechecks rows, including under concurrent
  -- renewal/sweep. Unused allowance never rolls over; missed months reset once.
  UPDATE public.subscriptions
  SET monthly_video_allowance_used = 0,
      monthly_round_allowance_used = 0,
      monthly_full_battle_cap_used = 0,
      allowance_reset_at = internal.next_subscription_allowance_reset(
        COALESCE(allowance_anchor_at, starts_at), expires_at, p_at),
      updated_at = NOW()
  WHERE status IN ('active', 'canceled')
    AND expires_at > p_at
    AND split_part(product_id, ':', 1) = 'promptwars_plus_annual'
    AND allowance_reset_at <= p_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_allowance_reset
  ON public.subscriptions (allowance_reset_at)
  WHERE status IN ('active', 'canceled');

CREATE OR REPLACE FUNCTION public.process_revenuecat_event(p_event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
SET timezone = 'UTC'
AS $$
DECLARE
  v_type TEXT := p_event->>'type';
  v_product TEXT := p_event->>'product_id';
  v_base_product TEXT := split_part(p_event->>'product_id', ':', 1);
  v_profile_id UUID;
  v_transaction TEXT := NULLIF(p_event->>'transaction_id', '');
  v_original TEXT := COALESCE(NULLIF(p_event->>'original_transaction_id', ''), v_transaction);
  v_subscription BOOLEAN;
  v_lifecycle BOOLEAN;
  v_credits INTEGER;
  v_ftuo BOOLEAN;
  v_platform TEXT;
  v_purchase public.purchases%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_new_purchase BOOLEAN;
  v_purchased_at TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
  v_event_at TIMESTAMPTZ;
  v_reset TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF NULLIF(trim(p_event->>'id'), '') IS NULL THEN
    RAISE EXCEPTION 'RevenueCat event id is required for idempotency';
  END IF;

  v_subscription := v_base_product IN ('promptwars_plus_monthly', 'promptwars_plus_annual');
  v_lifecycle := v_type IN ('CANCELLATION', 'UNCANCELLATION', 'EXPIRATION');
  v_credits := CASE v_product
    WHEN 'credits_10' THEN 10 WHEN 'credits_30' THEN 30
    WHEN 'credits_80' THEN 80 WHEN 'credits_200' THEN 200 END;
  v_ftuo := left(v_product, 5) = 'ftuo_';

  IF NOT COALESCE(
    (v_subscription AND (v_type IN ('INITIAL_PURCHASE', 'RENEWAL') OR v_lifecycle))
    OR (v_type IN ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE')
      AND (v_credits IS NOT NULL OR v_ftuo)), FALSE)
  THEN
    IF v_product LIKE 'credits_%' AND v_type IN ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE') THEN
      RAISE EXCEPTION 'Invalid credit product_id';
    END IF;
    RETURN jsonb_build_object('processed', TRUE, 'action', 'ignored', 'event_type', v_type);
  END IF;

  -- Dashboard tests / deleted profiles need no retry. Database errors are not
  -- caught here: unlike the previous handler, an outage cannot become a 200.
  BEGIN
    v_profile_id := (p_event->>'app_user_id')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_profile_id := NULL;
  END;
  IF v_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_profile_id) THEN
    RETURN jsonb_build_object('processed', FALSE, 'action', 'ignored_unknown_profile');
  END IF;
  IF v_transaction IS NULL THEN
    RAISE EXCEPTION 'RevenueCat transaction_id is required';
  END IF;

  -- This claim is now inside the SAME transaction as every fulfillment write.
  IF NOT public.claim_revenuecat_event(p_event->>'id', v_type, v_profile_id) THEN
    RETURN jsonb_build_object('processed', TRUE, 'duplicate', TRUE);
  END IF;

  -- Use the existing wallet lock convention for grants and FTUO/cosmetic writes.
  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || v_profile_id::TEXT));

  v_purchased_at := COALESCE(to_timestamp((p_event->>'purchased_at_ms')::DOUBLE PRECISION / 1000), NOW());
  v_event_at := COALESCE(to_timestamp((p_event->>'event_timestamp_ms')::DOUBLE PRECISION / 1000), v_purchased_at);
  v_expires := to_timestamp((p_event->>'expiration_at_ms')::DOUBLE PRECISION / 1000);
  v_platform := CASE upper(p_event->>'store')
    WHEN 'APP_STORE' THEN 'ios' WHEN 'MAC_APP_STORE' THEN 'ios'
    WHEN 'PLAY_STORE' THEN 'android' WHEN 'AMAZON' THEN 'android'
    WHEN 'STRIPE' THEN 'web' WHEN 'RC_BILLING' THEN 'web'
    WHEN 'PADDLE' THEN 'web' WHEN 'ROKU' THEN 'web'
    WHEN 'TEST_STORE' THEN 'test' WHEN 'PROMOTIONAL' THEN 'promotional'
    ELSE 'unknown' END;

  IF v_subscription THEN
    SELECT * INTO v_sub FROM public.subscriptions
    WHERE revenuecat_subscription_id = v_original FOR UPDATE;
    IF FOUND AND v_sub.profile_id <> v_profile_id THEN
      RAISE EXCEPTION 'Subscription belongs to a different profile';
    END IF;

    IF v_lifecycle THEN
      IF v_sub.id IS NULL THEN
        -- An out-of-order delivery can precede activation. Retry instead of
        -- claiming success after an UPDATE that affected zero rows.
        RAISE EXCEPTION 'Subscription activation has not been received';
      END IF;
      IF v_sub.revenuecat_event_at IS NULL OR v_event_at >= v_sub.revenuecat_event_at THEN
        UPDATE public.subscriptions
        SET status = CASE v_type WHEN 'CANCELLATION' THEN 'canceled'
                     WHEN 'EXPIRATION' THEN 'expired' ELSE 'active' END,
            expires_at = COALESCE(v_expires, expires_at),
            revenuecat_event_at = v_event_at, updated_at = NOW()
        WHERE id = v_sub.id;
      END IF;
      RETURN jsonb_build_object('processed', TRUE, 'type', lower(v_type));
    END IF;

    -- Never invent a paid month when the provider omitted its paid-through date.
    IF v_expires IS NULL OR v_expires <= v_purchased_at THEN
      RAISE EXCEPTION 'Subscription expiration must follow purchased_at_ms';
    END IF;
  END IF;

  INSERT INTO public.purchases (
    profile_id, revenuecat_transaction_id, product_id, amount_usd,
    currency_code, platform, credits_granted
  ) VALUES (
    v_profile_id, v_transaction, v_product,
    COALESCE((p_event->>'price')::NUMERIC,
      CASE WHEN p_event->>'currency' = 'USD' THEN (p_event->>'price_in_purchased_currency')::NUMERIC END),
    p_event->>'currency', v_platform, COALESCE(v_credits, 0)
  ) ON CONFLICT (revenuecat_transaction_id) DO NOTHING
  RETURNING * INTO v_purchase;
  v_new_purchase := FOUND;
  IF NOT v_new_purchase THEN
    SELECT * INTO v_purchase FROM public.purchases
    WHERE revenuecat_transaction_id = v_transaction FOR UPDATE;
  END IF;
  IF v_purchase.profile_id <> v_profile_id OR v_purchase.product_id <> v_product THEN
    RAISE EXCEPTION 'Purchase belongs to a different profile or product';
  END IF;

  IF v_subscription THEN
    -- A delayed delivery grants the current month's allowance, without a
    -- second immediate reset on the scheduler's next tick.
    v_reset := CASE WHEN v_base_product = 'promptwars_plus_annual' THEN
      internal.next_subscription_allowance_reset(
        v_purchased_at, v_expires, GREATEST(v_purchased_at, NOW()))
      ELSE v_expires END;
    IF v_sub.id IS NULL THEN
      INSERT INTO public.subscriptions (
        profile_id, revenuecat_subscription_id, product_id, status, tier,
        starts_at, expires_at, allowance_anchor_at, allowance_reset_at, revenuecat_event_at,
        monthly_video_allowance, monthly_round_allowance, monthly_full_battle_cap
      ) VALUES (
        v_profile_id, v_original, v_product, 'active', 'plus',
        v_purchased_at, v_expires, v_purchased_at, v_reset, v_event_at, 30, 90, 30
      );
    ELSIF v_new_purchase AND (
      v_sub.allowance_anchor_at IS NULL OR v_purchased_at > v_sub.allowance_anchor_at
    ) THEN
      -- A cancellation can arrive before the renewal that paid for that period.
      -- Advance the paid allowance independently, while preserving newer status.
      UPDATE public.subscriptions
      SET product_id = v_product,
          status = CASE WHEN revenuecat_event_at IS NULL OR v_event_at >= revenuecat_event_at
                   THEN 'active' ELSE status END,
          expires_at = CASE WHEN revenuecat_event_at IS NULL OR v_event_at >= revenuecat_event_at
                       THEN v_expires ELSE expires_at END,
          monthly_video_allowance_used = 0, monthly_round_allowance_used = 0,
          monthly_full_battle_cap_used = 0,
          allowance_anchor_at = v_purchased_at, allowance_reset_at = v_reset,
          revenuecat_event_at = GREATEST(revenuecat_event_at, v_event_at), updated_at = NOW()
      WHERE id = v_sub.id;
    END IF;
    v_result := jsonb_build_object('processed', TRUE, 'type',
      CASE WHEN v_type = 'RENEWAL' THEN 'subscription_renewed' ELSE 'subscription_activated' END);
  ELSIF v_credits IS NOT NULL THEN
    -- Keep the old transaction-based key to remain idempotent across deployment
    -- and recover purchases whose row was committed before their credit grant.
    PERFORM public.grant_credits(v_profile_id, v_credits, 'purchase',
      'credits_grant_' || v_transaction, NULL, v_purchase.id);
    v_result := jsonb_build_object('processed', TRUE, 'type', 'credit_pack_purchased',
      'credits_granted', v_credits, 'duplicate', NOT v_new_purchase);
  ELSE
    v_result := public.fulfill_first_time_offer(v_profile_id, v_purchase.id);
    IF NOT COALESCE((v_result->>'success')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'Failed to fulfill offer: %', v_result->>'error';
    END IF;
    v_result := jsonb_build_object('processed', TRUE, 'type', 'ftuo_purchased', 'result', v_result);
  END IF;

  UPDATE public.purchases SET fulfilled_at = COALESCE(fulfilled_at, NOW())
  WHERE id = v_purchase.id;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.process_revenuecat_event(JSONB) IS
  'Service-role fulfillment of an authenticated RevenueCat event. Claim, purchase, subscription and ledger changes commit or roll back together.';
COMMENT ON TABLE public.revenuecat_events IS
  'Processed RevenueCat events. New fulfillment commits the claim atomically with its mutations. Pre-migration records retain their prior semantics.';

REVOKE ALL ON FUNCTION public.process_revenuecat_event(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_revenuecat_event(JSONB) TO service_role;
REVOKE ALL ON FUNCTION internal.next_subscription_allowance_reset(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION internal.reset_subscription_allowances(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO service_role;
GRANT EXECUTE ON FUNCTION internal.next_subscription_allowance_reset(TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION internal.reset_subscription_allowances(TIMESTAMPTZ) TO service_role;


-- Keep spending/refunds aligned with entitlement views after auto-renew is off.
-- Counter and ledger semantics are otherwise unchanged for single and Bo3.
CREATE OR REPLACE FUNCTION decrement_subscriber_round_allowance(
  p_profile_id UUID,
  p_battle_id UUID,
  p_round_number SMALLINT,
  p_is_full_battle BOOLEAN,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing UUID;
  v_sub_id UUID;
BEGIN
  -- Idempotency.
  SELECT id INTO v_existing FROM wallet_transactions
  WHERE idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  SELECT id INTO v_sub_id FROM subscriptions
  WHERE profile_id = p_profile_id
    AND status IN ('active', 'canceled')
    AND expires_at > NOW()
  ORDER BY (status = 'active') DESC, expires_at DESC LIMIT 1
  FOR UPDATE;

  IF v_sub_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE subscriptions
  SET monthly_round_allowance_used = monthly_round_allowance_used + 1,
      monthly_full_battle_cap_used =
        CASE WHEN p_is_full_battle
             THEN monthly_full_battle_cap_used + 1
             ELSE monthly_full_battle_cap_used END,
      updated_at = NOW()
  WHERE id = v_sub_id;

  INSERT INTO wallet_transactions (
    profile_id, amount, balance_after, currency_type,
    reason, status, source,
    battle_id, round_number,
    idempotency_key,
    metadata
  )
  SELECT
    p_profile_id, 0,
    COALESCE(SUM(amount), 0),
    'credits',
    'round_upgrade_subscriber_audit',
    'spent',
    CASE WHEN p_is_full_battle THEN 'subscriber_full' ELSE 'subscriber_round' END,
    p_battle_id, p_round_number,
    p_idempotency_key,
    jsonb_build_object('subscription_id', v_sub_id, 'full_battle', p_is_full_battle)
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits'
    AND status IN ('final','held','spent','refunded');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION restore_subscription_allowance(
  p_profile_id UUID,
  p_video_job_id UUID,
  p_idempotency_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_transaction_exists BOOLEAN;
  v_sub_id UUID;
BEGIN
  -- Check idempotency
  SELECT EXISTS(
    SELECT 1 FROM wallet_transactions 
    WHERE idempotency_key = p_idempotency_key
  ) INTO v_transaction_exists;
  
  IF v_transaction_exists THEN
    RETURN TRUE; -- Already processed
  END IF;
  
  -- Find the same paid-through subscription selected by entitlements.
  SELECT id INTO v_sub_id
  FROM subscriptions
  WHERE profile_id = p_profile_id
    AND status IN ('active', 'canceled')
    AND expires_at > NOW()
  ORDER BY (status = 'active') DESC, expires_at DESC
  LIMIT 1
  FOR UPDATE;
  
  IF v_sub_id IS NULL THEN
    RETURN FALSE; -- No paid-through subscription
  END IF;
  
  -- Decrement allowance used (with floor at 0)
  UPDATE subscriptions
  SET 
    monthly_video_allowance_used = GREATEST(monthly_video_allowance_used - 1, 0),
    updated_at = NOW()
  WHERE id = v_sub_id;
  
  -- Insert audit transaction (zero-amount, just for tracking)
  INSERT INTO wallet_transactions (
    profile_id,
    amount,
    balance_after,
    currency_type,
    reason,
    video_job_id,
    idempotency_key,
    metadata
  )
  SELECT 
    p_profile_id,
    0,
    COALESCE(SUM(wt.amount), 0),
    'credits',
    'subscription_allowance_restored',
    p_video_job_id,
    p_idempotency_key,
    jsonb_build_object('restored', true, 'subscription_id', v_sub_id)
  FROM wallet_transactions wt
  WHERE wt.profile_id = p_profile_id AND wt.currency_type = 'credits';
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.decrement_subscriber_round_allowance(UUID, UUID, SMALLINT, BOOLEAN, TEXT)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.restore_subscription_allowance(UUID, UUID, TEXT)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.decrement_subscriber_round_allowance(UUID, UUID, SMALLINT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_subscription_allowance(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_subscriber_round_allowance(UUID, UUID, SMALLINT, BOOLEAN, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_subscription_allowance(UUID, UUID, TEXT)
  TO service_role;

-- pg_cron is already enabled by 20260526120000_schedule_background_workers.sql.
-- Named scheduling updates the existing job if this migration is reapplied.
-- Direct SQL needs no Vault secret, network call, or separate Edge deployment.
SELECT cron.schedule('reset-subscription-allowances', '* * * * *',
  'SELECT internal.reset_subscription_allowances();');
