# Edit Look — Gear mockup parity

Implemented 20 September 2026 against the supplied Gear reference (`reference.png`). Open `comparison.html` for the reference, native screenshots, chest glyph and all fifteen final illustrations.

## Changes

| Mismatch | Implementation |
| --- | --- |
| Flat, small signature-item icons | Fifteen separate gold/obsidian illustrations with violet light, bundled as landscape artwork plates. |
| Wrench-shaped Gear navigation icon | Original equipment-chest SVG in the existing 64-unit glyph family. |
| Small current-item thumbnail and long description | Wide gold-edged banner, large contained item artwork, current/staged label, name and concise identity copy. Retained custom items remain identifiable. |
| Padded tiles with repeated captions and separate eye-icon buttons | Full-width artwork, a quiet name/Preview-chevron row and one cut-corner gold edge. Selected items retain explicit text and accessibility state. |
| Different initial choices | Compass, Hourglass, Crown Fragment and Briefcase lead the collection; all returned predefined choices remain available through Browse all and search. |
| Tiny artwork in item details | The same large illustration in the bounded detail sheet, with Close and the existing pinned free-selection action. |
| Silver editor heading and mismatched preview links | Gold metallic EDIT LOOK heading, lavender current-artwork label, white fighter name and matching chevron links. |
| Large-text category clipping | Rail height follows measured text, wider tabs scroll horizontally, and selection/size changes reveal the active tab. Footer status retains intrinsic height. |

Art, native labels and interaction remain separate. Cards are not pressable containers: Preview opens details; **Use this item · Free** only stages the choice. Saving/drawing, live prices, battle locks, grants and recovery remain in the existing editor hooks. A locked detail sheet now announces **Manage battles** consistently with its visible action.

`EditorItemArt` preserves custom remote art even when its name matches a bundled item. Retry can reload the same failed URL, refreshed URLs become eligible automatically, and successful loads clear retry feedback. These paths never invoke saving or generation.

## Assets

The built-in `image_gen` tool generated each item separately from the approved reference and the first pen illustration. Every output was visually reviewed for silhouette, full-object framing, consistent materials and absence of interface text. Production JPEGs retain the 1536 × 1024 dimensions and total **6,410,651 bytes**. Full-resolution generated PNGs are preserved in `output/imagegen/2026-09-20-signature-items/`.

Final assets and exact prompts/checksums: `assets/signature-icons/generation-manifest.json`. Old PNG icons remain for historical mockup references; the editor explicitly loads the new JPEGs. No catalogue upload, server change, migration or new fighter render is involved.

## Verification

- **TypeScript:** `yarn tsc --noEmit` passed.
- **ESLint:** changed files passed explicit ESLint; `yarn lint` passed with the existing `app/_layout.tsx:29` require-import warning.
- **Jest:** final full run passed **163 suites / 1,356 tests**, no snapshots. New checks cover retrying an unchanged failed image, refreshed URLs, preserving custom artwork, featured choices without dropping catalogue entries, selected-tab visibility, and the locked Manage battles action.
- Existing preview/stage/dismiss, busy guards, catalogue search, legacy equipment, editor recovery, navigation and draft suites remain green.
- Fixture isolation check and `git diff --check` passed.
- Native iOS fixture on **402 × 874** and **375 × 812** phones: bundled images, gold edges, new icon, current-item banner, two-/one-column layouts, sheet preview, free staging, changed-item feedback and scrolling inspected. Large-text checking caught and led to the category-height/visibility fix. Accessibility Medium (1.79 text scale) evidence includes the horizontal selected rail, stacked footer and scrolling content. The dedicated simulator's original text-size setting was restored.

Native screenshots use the actual shared components in the isolated development fixture, with bundled fighter art and simulated balance/state. They do not demonstrate authenticated production transactions. The small DEV banner and Expo control are fixture chrome, not app UI. The layout intentionally scrolls the remaining cards rather than shrinking controls to fit four cards above the footer.

## Limits and delivery

Android native validation remains **blocked**, as instructed, until an environment is available. A full VoiceOver/TalkBack walkthrough and production payment/provider checks were not rerun for this presentation-only follow-up. Artwork and borders are decorative; shared accessible labels, states and 48-point targets remain covered by component tests.

No version bump, production build, store submission, backend deployment or combat/appeal flag change was performed. Existing unrelated battle, suggestion, video and audio work was preserved.
