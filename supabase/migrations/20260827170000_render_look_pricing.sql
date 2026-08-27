-- Charge for renders, not for adjectives.
--
-- The edit screen billed players for DESCRIBING a character and then billed
-- them again to SEE the result: three staged trait changes cost 2 credits and
-- left the portrait untouched, the render cost 1 more, the avatar 1 more again.
-- Three of those four charges bought nothing anyone could perceive.
--
-- Tapping "Far Future" costs nothing at the provider; the image does. So every
-- describing field goes free and the money moves to the one action that
-- actually generates pixels -- which now produces the fighter render AND the
-- avatar together, because they are two framings of one character and selling
-- somebody their own face as an add-on was always a storage detail leaking into
-- the product.

--------------------------------------------------------------------------------
-- PRICING
--------------------------------------------------------------------------------

INSERT INTO character_edit_prices (edit_kind, credits, cooldown_seconds) VALUES
  -- One button: fighter portrait + avatar, one charge.
  ('render_look', 3, 0),
  -- Shuffles all five traits AND renders both images in one action.
  ('random_character', 5, 0)
ON CONFLICT (edit_kind) DO UPDATE
  SET credits = EXCLUDED.credits,
      cooldown_seconds = EXCLUDED.cooldown_seconds,
      updated_at = NOW();

-- Describing is free. These rows stay so the edit log keeps resolving a price
-- for historical kinds, but they no longer cost anything.
UPDATE character_edit_prices
   SET credits = 0, updated_at = NOW()
 WHERE edit_kind IN ('traits_single_swap', 'traits_full_reroll', 'new_portrait');

-- Palette sits alongside five other free, unrestricted Look controls. A 24-hour
-- cooldown on exactly one of them was incoherent the moment the rest went free.
UPDATE character_edit_prices
   SET cooldown_seconds = 0, updated_at = NOW()
 WHERE edit_kind = 'palette';

-- Deliberately untouched: rename (7d) and archetype (14d) are identity-churn
-- guards rather than prices, and signature_color keeps its 24h for the same
-- reason. Cooldowns and credits are separate axes.
--
-- Also left in place but no longer read: regenerate_portrait, regenerate_avatar,
-- initial_avatar. regenerate-portrait was their only consumer and now prices
-- every render through render_look / random_character.

--------------------------------------------------------------------------------
-- A CHARACTER ALWAYS HAS A SIGNATURE ITEM
--------------------------------------------------------------------------------
-- The item feeds the portrait prompt, so "none" renders blander for no reason
-- anybody chose, and nullability bought an empty state, an Unequip button and a
-- branch in the prompt builder in exchange for a configuration no player wants.

-- Deterministic pick from the shared catalogue instances. Random per character,
-- but seeded from the character id so re-running this statement cannot reshuffle
-- anyone -- the one real cost of choosing a random default over a fixed one.
CREATE OR REPLACE FUNCTION default_signature_item_for(p_character_id UUID)
RETURNS UUID AS $$
  SELECT si.id
    FROM signature_items si
   WHERE si.kind = 'catalog'
     AND si.moderation_status <> 'rejected'
   ORDER BY md5(p_character_id::text || si.id::text)
   LIMIT 1;
$$ LANGUAGE sql STABLE;

UPDATE characters
   SET signature_item_id = default_signature_item_for(id)
 WHERE signature_item_id IS NULL;

-- Covers every creation path rather than just the two we know about:
-- finalize-character-creation treats the item as optional, and column defaults
-- are applied before BEFORE-INSERT triggers fire, so NEW.id is already set here.
CREATE OR REPLACE FUNCTION characters_assign_default_item()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.signature_item_id IS NULL THEN
    NEW.signature_item_id := default_signature_item_for(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS characters_assign_default_item_trg ON characters;
CREATE TRIGGER characters_assign_default_item_trg
  BEFORE INSERT ON characters
  FOR EACH ROW EXECUTE FUNCTION characters_assign_default_item();

-- Safe only because of the trigger above and the seeded catalogue. If
-- signature_items ever held no usable 'catalog' row, inserts would fail here
-- rather than silently producing itemless characters -- which is the correct
-- direction to fail.
ALTER TABLE characters ALTER COLUMN signature_item_id SET NOT NULL;

COMMENT ON COLUMN characters.signature_item_id IS
  'Always set. Assigned by characters_assign_default_item on insert when the creation flow does not choose one. Unequipping is not a supported state.';
