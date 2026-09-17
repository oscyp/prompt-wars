-- Additive catalog contract: existing clients keep version 1 behavior.
ALTER TABLE public.cosmetics_catalog ADD COLUMN IF NOT EXISTS min_client_contract_version INTEGER NOT NULL DEFAULT 1 CHECK (min_client_contract_version >= 1);

INSERT INTO public.cosmetics_catalog (slug, name, description, cosmetic_type, rarity, acquisition, price_credits, unlock_rule, value, preview_asset_path, sort_order, min_client_contract_version) VALUES
('astral_codex_frame', 'Astral Codex', 'Celestial runes surround your champion.', 'frame', 'epic', 'credits', 25, NULL, 'astral_codex_frame', 'assets/cosmetics/frames/astral-codex-portrait.png', 110, 2),
('emberforge_frame', 'Emberforge', 'Forged metal and glowing embers.', 'frame', 'epic', 'credits', 25, NULL, 'emberforge_frame', 'assets/cosmetics/frames/emberforge-portrait.png', 111, 2),
('neon_circuit_frame', 'Neon Circuit', 'Electric circuits illuminate your champion.', 'frame', 'epic', 'credits', 25, NULL, 'neon_circuit_frame', 'assets/cosmetics/frames/neon-circuit-portrait.png', 112, 2),
('laureate_frame', 'Laureate', 'Golden laurels for a celebrated champion. Earn with 50 wins or unlock with credits.', 'frame', 'legendary', 'play_unlock', 40, '{"wins":50}', 'laureate_frame', 'assets/cosmetics/frames/laureate-portrait.png', 113, 2)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION purchase_cosmetic(
  p_profile_id UUID,
  p_cosmetic_slug TEXT,
  p_client_contract_version INTEGER
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

  IF v_cosmetic.min_client_contract_version > COALESCE(p_client_contract_version, 1) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'unsupported_client');
  END IF;
  IF v_cosmetic.cosmetic_type NOT IN ('frame', 'title', 'badge', 'avatar_effect', 'color') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_available');
  END IF;

  -- The PRICE is the gate, not the acquisition type. An item with no price
  -- cannot be bought whatever its type, which keeps free, subscription and
  -- exclusive items unpurchasable without naming them here.
  IF v_cosmetic.price_credits IS NULL
     OR v_cosmetic.acquisition NOT IN ('credits', 'play_unlock') THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

CREATE OR REPLACE FUNCTION equip_cosmetic(
  p_profile_id UUID,
  p_character_id UUID,
  p_cosmetic_type TEXT,
  p_cosmetic_slug TEXT,
  p_client_contract_version INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_cosmetic cosmetics_catalog%ROWTYPE;
  v_owns BOOLEAN;
  v_char_owner UUID;
  v_config JSONB;
BEGIN
  IF p_cosmetic_type NOT IN ('frame', 'title', 'badge', 'avatar_effect') OR p_cosmetic_type IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'unsupported_slot');
  END IF;
  SELECT profile_id INTO v_char_owner FROM characters WHERE id = p_character_id FOR UPDATE;
  IF v_char_owner IS NULL OR v_char_owner <> p_profile_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_your_character');
  END IF;

  -- Unequip path.
  IF p_cosmetic_slug IS NULL THEN
    UPDATE characters
    SET cosmetic_config = COALESCE(cosmetic_config, '{}'::jsonb) - p_cosmetic_type
    WHERE id = p_character_id RETURNING cosmetic_config INTO v_config;
    RETURN jsonb_build_object('success', TRUE, 'equipped', NULL, 'type', p_cosmetic_type, 'cosmetic_config', v_config);
  END IF;

  SELECT * INTO v_cosmetic
  FROM cosmetics_catalog WHERE slug = p_cosmetic_slug AND is_active = TRUE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'not_found');
  END IF;

  IF v_cosmetic.min_client_contract_version > COALESCE(p_client_contract_version, 1) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'unsupported_client');
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
  WHERE id = p_character_id RETURNING cosmetic_config INTO v_config;

  RETURN jsonb_build_object('success', TRUE, 'equipped', p_cosmetic_slug, 'type', p_cosmetic_type, 'cosmetic_config', v_config);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

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
    SELECT 1 FROM entitlements WHERE profile_id = p_profile_id AND is_subscriber
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp;

-- Preserve legacy RPC signatures while requiring the default contract gate.
CREATE OR REPLACE FUNCTION public.purchase_cosmetic(p_profile_id UUID, p_cosmetic_slug TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$ SELECT public.purchase_cosmetic(p_profile_id, p_cosmetic_slug, 1); $$;
CREATE OR REPLACE FUNCTION public.equip_cosmetic(p_profile_id UUID, p_character_id UUID, p_cosmetic_type TEXT, p_cosmetic_slug TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$ SELECT public.equip_cosmetic(p_profile_id, p_character_id, p_cosmetic_type, p_cosmetic_slug, 1); $$;
REVOKE ALL ON FUNCTION public.purchase_cosmetic(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_cosmetic(UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_cosmetic(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_cosmetic(UUID, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.equip_cosmetic(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic(UUID, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.equip_cosmetic(UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equip_cosmetic(UUID, UUID, TEXT, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.sync_unlocked_cosmetics(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_unlocked_cosmetics(UUID) TO service_role;
