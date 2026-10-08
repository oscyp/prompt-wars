# Signature-item artwork

The editor uses the 15 **JPEG** plates generated on 20 September 2026 with the built-in `image_gen` tool. Their visual reference is the approved Edit Look Gear mockup. Each is a separate illustration: no labels, card borders, prices or controls are rasterized.

`generation-manifest.json` contains every final prompt, the generated source filename, local full-resolution original path, production asset path, encoding and SHA-256 checksum. JPEG encoding retains the original 1536 × 1024 dimensions. The 15 bundled plates total 6,410,651 bytes. No provider calls are needed to display them.

The older PNG icons remain only for existing historical mockup references. `EditorItemArt` explicitly selects the new JPEGs for predefined catalogue names and preserves a custom item's remote artwork. Missing or failed artwork uses the native Gear chest glyph and can retry without a generation call.

The original SVG equipment-chest icon is `GAME_GLYPHS.gear` in `components/game/icons/glyphs.ts`. It follows the existing 64-unit glyph grid and uses the theme's gold/secondary/disabled ink; it is decorative and never adds a focus target.
