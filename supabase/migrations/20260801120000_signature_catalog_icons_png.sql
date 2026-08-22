-- Signature-item catalog icons: switch stored paths from .webp to .png.
--
-- The catalog picker renders icons with React Native's core <Image>, which
-- cannot decode webp on iOS. Icons are generated as PNG (see
-- scripts/generate-signature-icons.mjs) and uploaded to the
-- `signature-items-catalog` bucket at catalog/<slug>.png. This realigns the
-- stored image_path so list-signature-items-catalog builds a working PNG URL.
--
-- Idempotent: only rewrites rows still pointing at a catalog/*.webp path.

UPDATE signature_items_catalog
SET image_path = regexp_replace(image_path, '\.webp$', '.png'),
    updated_at = NOW()
WHERE image_path LIKE 'catalog/%.webp';

-- Keep the equippable catalog instances in sync (image_path is copied from the
-- catalog row at seed time; the list function reads the catalog path, but this
-- avoids a stale extension on the instance rows).
UPDATE signature_items
SET image_path = regexp_replace(image_path, '\.webp$', '.png'),
    updated_at = NOW()
WHERE kind = 'catalog' AND image_path LIKE 'catalog/%.webp';
