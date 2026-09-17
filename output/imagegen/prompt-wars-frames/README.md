# Prompt Wars — illustrated frame concepts

Generated on 14 September 2026 with the built-in image-generation tool. Four new frame concepts extend the existing cinematic arena direction. These files are design assets; the live shop and ownership records are unchanged.

[Open the interactive frame review](index.html) to compare dark/light/checkered backgrounds, inspect three render sizes, and overlay a bundled sample fighter.

| Frame | Direction | Suggested role, subject to product review |
| --- | --- | --- |
| [Astral Codex](astral-codex.png) | Obsidian, violet crystals, gold inlay, book and quill | Signature Prompt Wars collection; strongest connection to writing |
| [Emberforge](emberforge.png) | Scorched bronze, dark metal, molten seams | Bold combat-inspired collectible |
| [Neon Circuit](neon-circuit.png) | Graphite titanium, cyan/magenta light channels | Contemporary arena collection; preserves the existing neon palette |
| [Laureate](laureate.png) | Antique gold, emerald enamel, laurel and crossed quills | Prestige/progression collection; preserve an earned route |

All four PNGs are **1024 × 1536 RGBA**, with zero alpha at the center and exterior corner. [Validation data](asset-validation.json) records dimensions, alpha range and file size. The apparently tinted background in some image-generation previews is not an opaque fill in the PNG. Original alpha was preserved; no background removal or image editing was performed after generation.

Each source is approximately 1.6–1.9 MB. Optimize delivery sizes only after visual approval. [Exact prompts](prompts.json) are included for reproducibility and later revisions. `sample-mystic.jpg` is an unchanged copy of the game's existing bundled fallback artwork, used only in the review page.

The comparison page was visually checked in the browser at 216, 104 and 48 CSS pixels, on dark, light and checkerboard backgrounds and with the sample fighter. All four frames load and their openings remain transparent. At 104 pixels the families are distinguishable; at 48 pixels the fine quill and leaf detail becomes texture, confirming the need for simpler avatar companions. Background, size and sample controls were exercised. This browser art check is not native renderer integration testing.

## Integration notes

- These are tall portrait-frame concepts, not ready-made circular-avatar frames. Make dedicated circular companions and simpler small-size variants. Do not squash the portrait art into a circle.
- The safe portrait opening varies by design. Astral Codex has the deepest top/bottom ornament; fit the entire fighter within its measured opening and reduce the crest if it crowds the portrait at the chosen product size. Leave extra layout padding around the outer tips, especially Astral Codex and Laureate.
- Use an independent transparent overlay outside the clipped portrait, preserving the portrait's contain behavior, face and signature item. The overlay must not intercept taps or repeat accessibility labels.
- Judge and combat inputs must remain independent of cosmetic choice. These designs imply no stat bonus or scoring advantage.
- Keep existing owned frames, free/earned unlocks and Founders exclusivity. No new rarity, price, entitlement or grant has been finalized here.
- First repair the shared renderer and preview/equipment state; then ship compatible clients; only then activate new server catalog entries. Older clients currently resolve unknown slugs to no frame, while purchase eligibility checks only cosmetic type.

See the [shop audit](../../../docs/audits/2026-09-14-cosmetic-shop/README.md) for the full findings and suggested implementation order.

## Applied frame pairs

The approved portrait assets and matching circular avatars are bundled under `assets/cosmetics/frames/`. All eight files have true RGBA transparency with clear centers and corners. `production-asset-validation.json` records dimensions, sizes and hashes. Portraits are 1024×1536; avatars are 1254×1254. The shared renderer uses measured safe apertures in `constants/Cosmetics.ts`.

The review page now offers Portrait and Avatar contexts at 216, 104 and 48 px. Circular ornaments remain distinct at 48 px, with readable fighter silhouettes; detailed quill/book materials are intended for the larger preview. No runtime generation is needed. Review files stay outside EAS builds through `/output/` in `.easignore`.
