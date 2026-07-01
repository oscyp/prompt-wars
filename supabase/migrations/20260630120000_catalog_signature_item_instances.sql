-- Ensure starter catalog signature items are equippable by characters.
-- `characters.signature_item_id` references `signature_items(id)`, while the
-- catalog picker is backed by `signature_items_catalog`.

INSERT INTO signature_items (
  profile_id,
  catalog_id,
  kind,
  item_class,
  name,
  description,
  prompt_fragment,
  image_path,
  moderation_status
)
SELECT
  NULL,
  c.id,
  'catalog',
  c.item_class,
  c.name,
  c.description,
  c.prompt_fragment,
  c.image_path,
  'approved'::moderation_status
FROM signature_items_catalog c
WHERE NOT EXISTS (
  SELECT 1
  FROM signature_items si
  WHERE si.kind = 'catalog'
    AND si.catalog_id = c.id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_items_catalog_instance_unique
  ON signature_items(catalog_id)
  WHERE kind = 'catalog' AND catalog_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_character_signature_item()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.signature_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM signature_items si
    WHERE si.id = NEW.signature_item_id
      AND si.moderation_status <> 'rejected'
      AND (
        si.kind = 'catalog'
        OR (si.kind = 'custom' AND si.profile_id = NEW.profile_id)
      )
  ) THEN
    RAISE EXCEPTION 'invalid signature_item_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION validate_character_signature_item() FROM PUBLIC;

DROP TRIGGER IF EXISTS validate_character_signature_item_trg ON characters;
CREATE TRIGGER validate_character_signature_item_trg
  BEFORE INSERT OR UPDATE OF signature_item_id ON characters
  FOR EACH ROW EXECUTE FUNCTION validate_character_signature_item();