--------------------------------------------------------------------------------
-- COSMETICS SHOP (strictly cosmetic, anti-pay-to-win)
--------------------------------------------------------------------------------
-- The identity-driven microtransaction surface: frames, titles, avatar effects,
-- reveal styles, accent colors, badges. Hard rules enforced by data + functions:
--   * Cosmetics NEVER affect scoring, matchmaking, or ratings.
--   * Acquisition is one of: free, play_unlock, subscription, credits, exclusive.
--   * Archetypes are never sold here (they stay free baseline content).
-- All ownership writes are server-owned (SECURITY DEFINER); the entitlements
-- view exposes owned slugs for client feature-gating.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cosmetics_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cosmetic_type TEXT NOT NULL,   -- frame | title | avatar_effect | reveal_style | color | badge
  rarity TEXT NOT NULL DEFAULT 'common', -- common | rare | epic | legendary
  acquisition TEXT NOT NULL,     -- free | play_unlock | subscription | credits | exclusive
  price_credits INTEGER,         -- required when acquisition = 'credits'
  min_subscription_tier TEXT,    -- required when acquisition = 'subscription'
  unlock_rule JSONB,             -- required when acquisition = 'play_unlock' e.g. {"wins":25}
  value TEXT,                    -- hex for colors, asset/preset key otherwise
  preview_asset_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cosmetics_credits_need_price CHECK (
    acquisition <> 'credits' OR price_credits IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS player_cosmetics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cosmetic_id UUID NOT NULL REFERENCES cosmetics_catalog(id) ON DELETE CASCADE,
  acquired_via TEXT NOT NULL DEFAULT 'free', -- free | play_unlock | subscription | credits | exclusive
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_cosmetic_per_player UNIQUE (profile_id, cosmetic_id)
);

CREATE INDEX IF NOT EXISTS idx_player_cosmetics_profile ON player_cosmetics(profile_id);

ALTER TABLE cosmetics_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_cosmetics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cosmetics_catalog_public_read ON cosmetics_catalog;
CREATE POLICY cosmetics_catalog_public_read ON cosmetics_catalog
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS player_cosmetics_select_own ON player_cosmetics;
CREATE POLICY player_cosmetics_select_own ON player_cosmetics
  FOR SELECT USING (profile_id = auth.uid());

--------------------------------------------------------------------------------
-- grant_cosmetic: internal grant used by play/subscription/exclusive paths
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grant_cosmetic(
  p_profile_id UUID,
  p_cosmetic_slug TEXT,
  p_via TEXT DEFAULT 'free'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_cosmetic_id UUID;
  v_inserted BOOLEAN := FALSE;
BEGIN
  SELECT id INTO v_cosmetic_id
  FROM cosmetics_catalog WHERE slug = p_cosmetic_slug AND is_active = TRUE;

  IF v_cosmetic_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO player_cosmetics (profile_id, cosmetic_id, acquired_via)
  VALUES (p_profile_id, v_cosmetic_id, p_via)
  ON CONFLICT (profile_id, cosmetic_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- sync_unlocked_cosmetics: grant all earned/free/subscription cosmetics
--------------------------------------------------------------------------------
-- Idempotent. Safe to call on app load / after battles / after subscribing.
CREATE OR REPLACE FUNCTION sync_unlocked_cosmetics(p_profile_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_profile RECORD;
  v_is_subscriber BOOLEAN;
  v_row RECORD;
  v_rule JSONB;
  v_qualifies BOOLEAN;
  v_granted INTEGER := 0;
BEGIN
  SELECT wins, level, best_streak, total_battles, daily_login_streak
  INTO v_profile
  FROM profiles WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM subscriptions WHERE profile_id = p_profile_id AND status = 'active'
  ) INTO v_is_subscriber;

  FOR v_row IN
    SELECT * FROM cosmetics_catalog WHERE is_active = TRUE
  LOOP
    v_qualifies := FALSE;

    IF v_row.acquisition = 'free' THEN
      v_qualifies := TRUE;
    ELSIF v_row.acquisition = 'subscription' THEN
      v_qualifies := v_is_subscriber;
    ELSIF v_row.acquisition = 'play_unlock' THEN
      v_rule := COALESCE(v_row.unlock_rule, '{}'::jsonb);
      v_qualifies :=
        COALESCE(v_profile.wins              >= (v_rule->>'wins')::int, TRUE)
        AND COALESCE(v_profile.level         >= (v_rule->>'level')::int, TRUE)
        AND COALESCE(v_profile.best_streak   >= (v_rule->>'best_streak')::int, TRUE)
        AND COALESCE(v_profile.total_battles >= (v_rule->>'total_battles')::int, TRUE)
        AND COALESCE(v_profile.daily_login_streak >= (v_rule->>'daily_login_streak')::int, TRUE)
        -- An empty rule should not auto-grant a play_unlock item.
        AND v_rule <> '{}'::jsonb;
    END IF;

    IF v_qualifies THEN
      IF grant_cosmetic(p_profile_id, v_row.slug, v_row.acquisition) THEN
        v_granted := v_granted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_granted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- purchase_cosmetic: spend credits to own a 'credits' cosmetic
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION purchase_cosmetic(
  p_profile_id UUID,
  p_cosmetic_slug TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_cosmetic cosmetics_catalog%ROWTYPE;
  v_balance INTEGER;
  v_owned BOOLEAN;
BEGIN
  -- Serialize concurrent purchases for the same wallet so two in-flight buys
  -- cannot both pass the balance check and overspend (spend_credits has no
  -- row lock of its own). Lock is released at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext('wallet:' || p_profile_id::text));

  SELECT * INTO v_cosmetic
  FROM cosmetics_catalog WHERE slug = p_cosmetic_slug AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_found');
  END IF;

  IF v_cosmetic.acquisition <> 'credits' OR v_cosmetic.price_credits IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_purchasable');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM player_cosmetics
    WHERE profile_id = p_profile_id AND cosmetic_id = v_cosmetic.id
  ) INTO v_owned;

  IF v_owned THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'already_owned');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM wallet_transactions
  WHERE profile_id = p_profile_id AND currency_type = 'credits';

  IF v_balance < v_cosmetic.price_credits THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'insufficient_credits',
      'balance', v_balance,
      'price', v_cosmetic.price_credits
    );
  END IF;

  PERFORM spend_credits(
    p_profile_id,
    v_cosmetic.price_credits,
    'cosmetic_purchase',
    'cosmetic_' || p_profile_id::text || '_' || v_cosmetic.id::text,
    NULL,
    NULL,
    jsonb_build_object('cosmetic_slug', p_cosmetic_slug)
  );

  INSERT INTO player_cosmetics (profile_id, cosmetic_id, acquired_via)
  VALUES (p_profile_id, v_cosmetic.id, 'credits')
  ON CONFLICT (profile_id, cosmetic_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', TRUE,
    'cosmetic_slug', p_cosmetic_slug,
    'price', v_cosmetic.price_credits
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- equip_cosmetic: set/clear an owned cosmetic on one of the player's characters
--------------------------------------------------------------------------------
-- Pass p_cosmetic_slug = NULL to unequip the given type.
CREATE OR REPLACE FUNCTION equip_cosmetic(
  p_profile_id UUID,
  p_character_id UUID,
  p_cosmetic_type TEXT,
  p_cosmetic_slug TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_cosmetic cosmetics_catalog%ROWTYPE;
  v_owns BOOLEAN;
  v_char_owner UUID;
BEGIN
  SELECT profile_id INTO v_char_owner FROM characters WHERE id = p_character_id;
  IF v_char_owner IS NULL OR v_char_owner <> p_profile_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_your_character');
  END IF;

  -- Unequip path.
  IF p_cosmetic_slug IS NULL THEN
    UPDATE characters
    SET cosmetic_config = cosmetic_config - p_cosmetic_type
    WHERE id = p_character_id;
    RETURN jsonb_build_object('success', TRUE, 'equipped', NULL, 'type', p_cosmetic_type);
  END IF;

  SELECT * INTO v_cosmetic
  FROM cosmetics_catalog WHERE slug = p_cosmetic_slug AND is_active = TRUE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_found');
  END IF;

  IF v_cosmetic.cosmetic_type <> p_cosmetic_type THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'type_mismatch');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM player_cosmetics
    WHERE profile_id = p_profile_id AND cosmetic_id = v_cosmetic.id
  ) INTO v_owns;
  IF NOT v_owns THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_owned');
  END IF;

  UPDATE characters
  SET cosmetic_config = jsonb_set(
        COALESCE(cosmetic_config, '{}'::jsonb),
        ARRAY[p_cosmetic_type],
        to_jsonb(p_cosmetic_slug),
        TRUE
      )
  WHERE id = p_character_id;

  -- Colors also drive the character's signature accent.
  IF p_cosmetic_type = 'color' AND v_cosmetic.value IS NOT NULL THEN
    UPDATE characters SET signature_color = v_cosmetic.value WHERE id = p_character_id;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'equipped', p_cosmetic_slug, 'type', p_cosmetic_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- fulfill_first_time_offer: grant credits + exclusive cosmetic on FTUO purchase
--------------------------------------------------------------------------------
-- Called from the RevenueCat webhook when the FTUO product is purchased. Credits
-- are granted here (NOT via the generic product->credits map) so the offer's
-- exclusive cosmetic and lifecycle stay atomic. Idempotent via purchase id.
CREATE OR REPLACE FUNCTION fulfill_first_time_offer(
  p_profile_id UUID,
  p_purchase_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_player player_first_time_offers%ROWTYPE;
  v_offer first_time_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_player
  FROM player_first_time_offers WHERE profile_id = p_profile_id;

  IF FOUND AND v_player.status = 'purchased' THEN
    RETURN jsonb_build_object('success', TRUE, 'already_fulfilled', TRUE);
  END IF;

  IF FOUND THEN
    SELECT * INTO v_offer FROM first_time_offers WHERE id = v_player.offer_id;
  ELSE
    SELECT * INTO v_offer FROM first_time_offers WHERE is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'no_offer');
  END IF;

  -- Grant credits (idempotent on purchase id).
  PERFORM grant_credits(
    p_profile_id,
    v_offer.credits,
    'ftuo_purchase',
    'ftuo_' || p_purchase_id::text,
    NULL,
    p_purchase_id,
    jsonb_build_object('offer_slug', v_offer.slug)
  );

  -- Grant the exclusive cosmetic (if configured).
  IF v_offer.exclusive_cosmetic_slug IS NOT NULL THEN
    PERFORM grant_cosmetic(p_profile_id, v_offer.exclusive_cosmetic_slug, 'exclusive');
  END IF;

  -- Mark lifecycle purchased. Upsert (not UPDATE) so the purchased state is
  -- recorded even when the offer was fulfilled without ever being surfaced
  -- (e.g. a deep-linked or restored purchase with no pending player row).
  INSERT INTO player_first_time_offers (
    profile_id, offer_id, status, first_shown_at, expires_at, purchased_at, purchase_id
  )
  VALUES (p_profile_id, v_offer.id, 'purchased', NOW(), NOW(), NOW(), p_purchase_id)
  ON CONFLICT (profile_id) DO UPDATE
  SET status = 'purchased',
      purchased_at = NOW(),
      purchase_id = EXCLUDED.purchase_id,
      updated_at = NOW();

  -- Reflect on the abuse-signal record used by the farm guard.
  UPDATE account_abuse_signals
  SET ftuo_purchased_at = NOW(), updated_at = NOW()
  WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'credits_granted', v_offer.credits,
    'cosmetic_granted', v_offer.exclusive_cosmetic_slug
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- Refresh the entitlements view so cosmetic_unlocks reflects real ownership
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW entitlements AS
SELECT
  p.id AS profile_id,
  COALESCE(s.status = 'active', FALSE) AS is_subscriber,
  s.tier AS subscription_tier,
  COALESCE(s.monthly_video_allowance - s.monthly_video_allowance_used, 0) AS monthly_video_allowance_remaining,
  COALESCE(
    (SELECT SUM(amount) FROM wallet_transactions wt
     WHERE wt.profile_id = p.id AND wt.currency_type = 'credits'),
    0
  ) AS credits_balance,
  COALESCE(s.status = 'active', FALSE) AS priority_queue,
  COALESCE(
    (SELECT jsonb_agg(c.slug ORDER BY c.slug)
     FROM player_cosmetics pc
     JOIN cosmetics_catalog c ON c.id = pc.cosmetic_id
     WHERE pc.profile_id = p.id),
    '[]'::jsonb
  ) AS cosmetic_unlocks,
  GREATEST(p.updated_at, s.updated_at,
    (SELECT MAX(created_at) FROM wallet_transactions wt WHERE wt.profile_id = p.id)
  ) AS updated_at
FROM profiles p
LEFT JOIN subscriptions s ON s.profile_id = p.id AND s.status = 'active'
;

-- All cosmetic mutations run server-side via the service-role cosmetics edge
-- function; clients never call them directly. Revoke the implicit PUBLIC grant
-- so anon/authenticated cannot spend another player's credits, self-grant
-- exclusive items, or equip cosmetics on characters they don't own.
REVOKE ALL ON FUNCTION grant_cosmetic(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION sync_unlocked_cosmetics(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_cosmetic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION equip_cosmetic(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fulfill_first_time_offer(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION grant_cosmetic(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sync_unlocked_cosmetics(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_cosmetic(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION equip_cosmetic(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION fulfill_first_time_offer(UUID, UUID) TO service_role;

--------------------------------------------------------------------------------
-- Seed: starter cosmetics catalog (directional credit prices, validate live)
--------------------------------------------------------------------------------
INSERT INTO cosmetics_catalog
  (slug, name, description, cosmetic_type, rarity, acquisition, price_credits, min_subscription_tier, unlock_rule, value, sort_order)
VALUES
  -- Free baseline
  ('classic_frame',  'Classic Frame',  'The clean default frame.',                 'frame', 'common', 'free',         NULL, NULL, NULL, NULL, 10),
  ('rookie_title',   'Rookie',         'Everybody starts somewhere.',              'title', 'common', 'free',         NULL, NULL, NULL, NULL, 11),
  -- Earned through play (anti-pay-to-win progression)
  ('veteran_frame',  'Veteran Frame',  'Awarded for 25 battles fought.',           'frame', 'rare',   'play_unlock',  NULL, NULL, '{"total_battles":25}', NULL, 20),
  ('gold_frame',     'Gold Frame',     'Reach level 10.',                          'frame', 'epic',   'play_unlock',  NULL, NULL, '{"level":10}',          NULL, 21),
  ('champion_title', 'Champion',       'Win 25 battles.',                          'title', 'epic',   'play_unlock',  NULL, NULL, '{"wins":25}',           NULL, 22),
  ('streak_badge',   'On Fire',        'Hit a 7-win streak.',                      'badge', 'rare',   'play_unlock',  NULL, NULL, '{"best_streak":7}',     NULL, 23),
  -- Subscription (Prompt Wars+)
  ('plus_frame',     'Plus Frame',     'Exclusive to Prompt Wars+ members.',       'frame', 'epic',   'subscription', NULL, 'plus', NULL, NULL, 30),
  ('plus_aura',      'Plus Aura',      'A glowing avatar aura for members.',       'avatar_effect', 'epic', 'subscription', NULL, 'plus', NULL, NULL, 31),
  ('plus_title',     'Plus One',       'Members-only title.',                      'title', 'rare',   'subscription', NULL, 'plus', NULL, NULL, 32),
  ('noir_reveal',    'Noir Reveal',    'Members-only cinematic reveal style.',     'reveal_style', 'epic', 'subscription', NULL, 'plus', NULL, 'noir', 33),
  -- Credit shop (impulse microtransactions)
  ('neon_frame',     'Neon Frame',     'Bright neon edge for your card.',          'frame', 'rare',   'credits',      15,   NULL, NULL, NULL, 40),
  ('royal_title',    'Royal',          'A regal flourish under your name.',        'title', 'rare',   'credits',      12,   NULL, NULL, NULL, 41),
  ('crimson_color',  'Crimson',        'A bold crimson signature accent.',         'color', 'rare',   'credits',      10,   NULL, NULL, '#ef4444', 42),
  ('galaxy_color',   'Galaxy',         'A deep violet signature accent.',          'color', 'epic',   'credits',      18,   NULL, NULL, '#7c3aed', 43),
  ('inferno_reveal', 'Inferno Reveal', 'A fiery cinematic reveal style.',          'reveal_style', 'epic', 'credits',  25, NULL, NULL, 'inferno', 44),
  -- Exclusive (FTUO only)
  ('founders_frame', 'Founders Frame', 'A one-of-a-kind frame from the launch offer. Never sold again.', 'frame', 'legendary', 'exclusive', NULL, NULL, NULL, NULL, 50)
ON CONFLICT (slug) DO NOTHING;
