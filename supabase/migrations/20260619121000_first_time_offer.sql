--------------------------------------------------------------------------------
-- FIRST-TIME-USER OFFER (FTUO)
--------------------------------------------------------------------------------
-- A one-time, time-boxed, higher-value offer surfaced 24-72h after install to
-- engaged non-payers (>=1 completed battle, not subscribed, no prior purchase,
-- not flagged for abuse). Per the concept doc this is the single biggest D7 ARPU
-- lever. Eligibility + lifecycle are fully server-owned; the client only renders
-- whatever get_first_time_offer() returns and reports purchase/dismiss.
--------------------------------------------------------------------------------

-- Offer catalog (data-driven; usually a single active row in MVP).
CREATE TABLE IF NOT EXISTS first_time_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  product_id TEXT NOT NULL,              -- RevenueCat product identifier
  credits INTEGER NOT NULL,              -- credits granted on fulfillment
  exclusive_cosmetic_slug TEXT,          -- optional one-of-a-kind cosmetic
  price_usd NUMERIC(10, 2),              -- display price (validated server-side on purchase)
  reference_price_usd NUMERIC(10, 2),    -- "value" anchor shown struck-through
  eligible_after_hours INTEGER NOT NULL DEFAULT 24,
  eligible_until_hours INTEGER NOT NULL DEFAULT 72,
  offer_ttl_hours INTEGER NOT NULL DEFAULT 48,  -- countdown length once surfaced
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One offer lifecycle row per player (a player can only ever receive one FTUO).
CREATE TABLE IF NOT EXISTS player_first_time_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES first_time_offers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | purchased | dismissed | expired
  first_shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  purchased_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  purchase_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_ftuo_status
  ON player_first_time_offers(status);

ALTER TABLE first_time_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_first_time_offers ENABLE ROW LEVEL SECURITY;

-- Catalog is readable by any authenticated user; player rows are private.
DROP POLICY IF EXISTS first_time_offers_public_read ON first_time_offers;
CREATE POLICY first_time_offers_public_read ON first_time_offers
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS player_ftuo_select_own ON player_first_time_offers;
CREATE POLICY player_ftuo_select_own ON player_first_time_offers
  FOR SELECT USING (profile_id = auth.uid());

--------------------------------------------------------------------------------
-- get_first_time_offer: eligibility + surfacing (server-owned)
--------------------------------------------------------------------------------
-- Returns JSONB { eligible, reason, offer, player_offer }. Surfaces (creates the
-- player row + starts the countdown) the first time an eligible player asks.
-- Idempotent and safe to call on every app foreground.
CREATE OR REPLACE FUNCTION get_first_time_offer(p_profile_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_offer first_time_offers%ROWTYPE;
  v_player player_first_time_offers%ROWTYPE;
  v_is_subscriber BOOLEAN;
  v_has_purchase BOOLEAN;
  v_is_flagged BOOLEAN;
  v_high_velocity BOOLEAN;
  v_account_age_hours NUMERIC;
BEGIN
  SELECT id, created_at, first_battle_completed_at
  INTO v_profile
  FROM profiles WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'no_profile');
  END IF;

  -- Pick the active offer (newest wins if several are active).
  SELECT * INTO v_offer
  FROM first_time_offers
  WHERE is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'no_active_offer');
  END IF;

  -- Existing lifecycle row: only a live pending row can still be shown.
  SELECT * INTO v_player
  FROM player_first_time_offers
  WHERE profile_id = p_profile_id;

  IF FOUND THEN
    IF v_player.status = 'pending' AND v_player.expires_at > NOW() THEN
      RETURN jsonb_build_object(
        'eligible', TRUE,
        'reason', 'active',
        'offer', to_jsonb(v_offer),
        'expires_at', v_player.expires_at
      );
    ELSIF v_player.status = 'pending' AND v_player.expires_at <= NOW() THEN
      UPDATE player_first_time_offers
      SET status = 'expired', updated_at = NOW()
      WHERE id = v_player.id;
      RETURN jsonb_build_object('eligible', FALSE, 'reason', 'expired');
    ELSE
      -- purchased / dismissed / expired: a player only gets one FTUO, ever.
      RETURN jsonb_build_object('eligible', FALSE, 'reason', v_player.status);
    END IF;
  END IF;

  -- No row yet: evaluate first-surface eligibility.
  IF v_profile.first_battle_completed_at IS NULL THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'no_battle');
  END IF;

  v_account_age_hours := EXTRACT(EPOCH FROM (NOW() - v_profile.created_at)) / 3600.0;

  IF v_account_age_hours < v_offer.eligible_after_hours THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'too_early');
  END IF;

  IF v_account_age_hours > v_offer.eligible_until_hours THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'window_closed');
  END IF;

  SELECT COALESCE(status = 'active', FALSE) INTO v_is_subscriber
  FROM subscriptions WHERE profile_id = p_profile_id AND status = 'active'
  LIMIT 1;
  IF COALESCE(v_is_subscriber, FALSE) THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'subscriber');
  END IF;

  SELECT EXISTS(SELECT 1 FROM purchases WHERE profile_id = p_profile_id) INTO v_has_purchase;
  IF v_has_purchase THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'already_payer');
  END IF;

  SELECT COALESCE(bool_or(is_flagged_suspicious), FALSE) INTO v_is_flagged
  FROM account_abuse_signals WHERE profile_id = p_profile_id;
  IF COALESCE(v_is_flagged, FALSE) THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'flagged');
  END IF;

  -- Anti-farm: positively consult signup-velocity signals, not just the
  -- async is_flagged_suspicious verdict, so a fresh account-farm burst cannot
  -- harvest the FTUO credits + exclusive cosmetic before review catches it.
  SELECT COALESCE(bool_or(
    COALESCE(ip_signup_count_24h, 0) > 5 OR COALESCE(device_signup_count_24h, 0) > 3
  ), FALSE) INTO v_high_velocity
  FROM account_abuse_signals WHERE profile_id = p_profile_id;
  IF COALESCE(v_high_velocity, FALSE) THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'velocity');
  END IF;

  -- Eligible: surface it (start the countdown).
  INSERT INTO player_first_time_offers (profile_id, offer_id, status, first_shown_at, expires_at)
  VALUES (
    p_profile_id,
    v_offer.id,
    'pending',
    NOW(),
    NOW() + make_interval(hours => v_offer.offer_ttl_hours)
  )
  ON CONFLICT (profile_id) DO NOTHING
  RETURNING * INTO v_player;

  IF v_player.id IS NULL THEN
    SELECT * INTO v_player FROM player_first_time_offers WHERE profile_id = p_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'eligible', TRUE,
    'reason', 'surfaced',
    'offer', to_jsonb(v_offer),
    'expires_at', v_player.expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- dismiss_first_time_offer
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dismiss_first_time_offer(p_profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE player_first_time_offers
  SET status = 'dismissed', dismissed_at = NOW(), updated_at = NOW()
  WHERE profile_id = p_profile_id AND status = 'pending';
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FTUO eligibility and dismissal are evaluated server-side only; the client
-- reaches them via the service-role first-time-offer edge function. Revoke the
-- default PUBLIC grant so anon/authenticated cannot self-surface or burn an
-- offer for an arbitrary profile id.
REVOKE ALL ON FUNCTION get_first_time_offer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION dismiss_first_time_offer(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_first_time_offer(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION dismiss_first_time_offer(UUID) TO service_role;

--------------------------------------------------------------------------------
-- Seed: a single starter FTUO (directional pricing, validate live via A/B)
--------------------------------------------------------------------------------
INSERT INTO first_time_offers (
  slug, title, description, product_id, credits, exclusive_cosmetic_slug,
  price_usd, reference_price_usd, eligible_after_hours, eligible_until_hours, offer_ttl_hours
)
VALUES (
  'starter_legend_bundle',
  'Legend Starter Bundle',
  'One-time welcome deal: a big credit boost plus the exclusive Founders frame you can never get again.',
  'ftuo_starter_legend',
  40,
  'founders_frame',
  4.99,
  14.99,
  24,
  72,
  48
)
ON CONFLICT (slug) DO NOTHING;
