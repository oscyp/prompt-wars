# Prompt Wars — Collectible direction

Three coordinated, static visual mockups prepared on 14 September 2026 following the request for a Marvel Snap-inspired direction. These are design exploration images, not implemented app screens or native accessibility acceptance evidence.

## Screens

- `arena.png`: art-led fighter card, all four stats, equipment/customization entry, actionable rounds and the retained central Battle button.
- `battle-workspace.png`: compact duel header, theme, deadline, three existing moves, calm writing area, local draft status and hold-to-submit with confirmation alternative. Keyboard is closed in this view.
- `cosmetic-shop.png`: a two-column frame collection using Astral Codex, Emberforge, Neon Circuit and Laureate; equipped state, prices, earned alternative and independent preview actions.
- `index.html`: responsive comparison gallery with an accessible native-dialog image viewer.
- `prompts.json`: exact generation prompts, references, source output paths and provenance.

## Shared direction

Use collectible card proportions, stronger display hierarchy, obsidian surfaces, restrained gold edging and violet action accents. Mira is a sample fighter based on the bundled Mystic art; the same identity appears throughout. Frame designs reuse the existing assets. Character rarity, paid stat upgrades, decks, energy and new battle mechanics are not proposed.

The visual study adapts the bold card presentation and art hierarchy of Marvel Snap to Prompt Wars' words-to-action identity. It does not change the underlying game or pricing. The mockups are illustrative compositions; raster text, logo treatments, artwork crops and icon treatment are not production assets or final specifications.

## Follow-through for a future implementation

- Translate ornament selectively into shared components; prioritize fighter artwork over utility chrome.
- Keep existing typography dependencies unless a separate typography decision is made.
- Use a flat readable editor and collapse the duel/stat area when the keyboard opens. Validate the keyboard-open composition separately.
- Preserve root tab state, the central Battle action, safe exits, local drafts, existing move mechanics and authoritative outcomes.
- Keep cosmetic acquisition/equipment controls in the preview detail, with clear price and ownership state before any commit.
- Reflow the Shop to one column for larger text and narrow screens; do not shrink labels to fit the illustrated grid.
- Validate actual native text sizes, contrast, 48-point control targets, safe areas, long/localized names, screen readers and reduced motion. The generated images do not prove these requirements.

## Generation

Created with the built-in `image_gen` tool. Final PNGs were copied unchanged into this directory; no programmatic image editing was used. The sample names, balance, battle state and deadline are demonstration data. Existing cosmetic prices are retained in the Shop mockup.

Application source and deployed builds are unchanged by this mockup task.
