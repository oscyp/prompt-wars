-- Make the cosmetic shop a shop.
--
-- Of 16 items only 5 could be bought. The rest read "Prompt Wars+",
-- "Win 25 battles", "Launch offer only" -- so a player holding credits mostly
-- found things they could not have, which is a display case rather than a store.
--
-- The fix is not to delete the achievements. The four play_unlock items are the
-- only cosmetic reward the game gives for playing, and converting them to
-- ordinary purchases would leave `unlock_rule` and `sync_unlocked_cosmetics`
-- with nothing to do. They keep their unlock rule as the free path and gain a
-- price as a shortcut: earn it, or buy it now.
--
-- Subscription perks and the Founders Frame stay unbuyable on purpose. The
-- former are what Prompt Wars+ visibly offers; the latter's own description says
-- "never sold again", and selling it would make that a lie to everyone holding
-- one.

--------------------------------------------------------------------------------
-- 1. EARNED ITEMS BECOME BUYABLE TOO
--------------------------------------------------------------------------------
-- The only change is the purchasability test. Everything downstream already
-- supports both paths: this function writes acquired_via = 'credits', its
-- spend_credits idempotency key is per (profile, cosmetic) so a double tap
-- cannot double-charge, and grant_cosmetic inserts ON CONFLICT DO NOTHING -- so
-- a player who buys an item and later earns it simply keeps the one they have.

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
$$ LANGUAGE plpgsql SECURITY DEFINER
   -- Pinned, matching every other SECURITY DEFINER function in this database.
   -- The original 20260619122000 definition had no SET, and the pin was applied
   -- out of band -- so redefining from that original silently un-hardened a
   -- function that spends credits. Verify against the live catalog, not the
   -- migration files.
   SET search_path = public, extensions;

-- Schema public's default ACL re-grants EXECUTE to anon/authenticated on every
-- CREATE, and REVOKE ... FROM PUBLIC does not remove an explicit role grant.
-- State the intent again rather than assuming the original migration still holds.
REVOKE ALL ON FUNCTION purchase_cosmetic(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_cosmetic(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION purchase_cosmetic(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION purchase_cosmetic(UUID, TEXT) TO service_role;

--------------------------------------------------------------------------------
-- 2. A RARITY PRICE LADDER
--------------------------------------------------------------------------------
-- Prices were 10, 12, 15, 18 and 25 with no rule behind them, which reads as
-- improvised at exactly the moment a player is deciding whether to spend.
--
--   common 10 · rare 15 · epic 25 · legendary 40
--
-- Applied only to items that should be sellable. Existing owners keep what they
-- bought -- a price change reaches future purchases only.

UPDATE cosmetics_catalog
   SET price_credits = CASE rarity
         WHEN 'common'    THEN 10
         WHEN 'rare'      THEN 15
         WHEN 'epic'      THEN 25
         WHEN 'legendary' THEN 40
         -- An unrecognised rarity keeps its current price rather than becoming
         -- NULL, which on a 'credits' row would violate cosmetics_credits_need_price
         -- and fail the whole migration.
         ELSE price_credits
       END
 WHERE is_active
   AND acquisition IN ('credits', 'play_unlock');

-- Belt and braces: nothing outside those two acquisitions may carry a price,
-- because a price is now what makes an item buyable.
UPDATE cosmetics_catalog
   SET price_credits = NULL
 WHERE acquisition NOT IN ('credits', 'play_unlock')
   AND price_credits IS NOT NULL;
