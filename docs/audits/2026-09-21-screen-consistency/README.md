# Screen consistency audit — 21 September 2026

Reviewed the current presentation entry points for the 21-screen inventory against the approved collectible direction and Edit Look mockups. This pass fixes clear inconsistencies and records the larger remaining gaps. Open [the native comparison gallery](comparison.html) for before/after evidence.

## Adjustments implemented

| Area | Finding | Change |
| --- | --- | --- |
| Create fighter → signature item | The creator still showed small remote icons or generic class glyphs, unlike the new Gear collection. | Reused all 15 bundled illustrated items and the same cut-corner frame. Kept the creator's direct selection, selected state, item class, responsive columns and full labels. No new generated assets or account requests. |
| Edit Look → Look | Section headings and links differed from the mockup; trait disclosure rows lacked custom glyphs and visual expanded state. | Lavender Barlow section labels, non-underlined chevron link, custom Vibe/Silhouette/Era/Expression glyphs and rotating disclosure chevrons. Existing traits and modes remain. |
| Edit Look → written mode | Art style was only a text link, missing the illustrated current-style row. | Added the current thumbnail, style label and chevron as one accessible 64-point-minimum row. Opens all eight styles in the existing bounded sheet. Locked styles stay inspectable. |
| Style sheet / accessibility text | Fixed-height images cropped into narrow strips as tiles widened; grid columns did not account for available label space. | The image viewport keeps a 3:2 ratio, independent of the source image's intrinsic dimensions. Grid uses available width, reflows to one column above 1.3 text scale, and preserves Close/Done and all choices. |
| Edit Look → Fighter | Five fully expanded archetype descriptions pushed later identity fields deep into the form. | One current-preset row opens the existing archetype sheet. All five presets, cooldown explanations, save-only staging and return focus remain. A lock arriving with the sheet open prevents mutation. Unknown saved preset labels remain readable. |
| Cosmetic Shop | Colour actions still referred to “Edit character,” inconsistent with the destination. | Uses “Edit Look” and “Signature colour.” Existing colour deep-link behavior remains covered by the Shop screen test. |
| Authentication and Stats | Every form/data section received the same gold emphasis as fighter cards. | Quiet borders for sign-in, sign-up and reset forms; Stats keeps emphasis on Overall Record and quietens the other four panels. No authentication, data or purchase logic changed. |
| Shared utility symbols | `cog-outline` inherited the newly changed equipment chest. | Maps to the existing Settings cog; equipment keeps the chest. |

Fighter artwork, pricing, entitlements, draft persistence, render recovery, save requests, battle rules and the raised center Battle action were preserved. No API/schema changes or release actions were made.

## Remaining recommendations

These are findings, not implemented features. They require a separately scoped layout/art/data pass rather than arbitrary changes to already approved behavior.

### R1 — Arena and Profile: prioritize the first viewport (high)

`components/game/FighterCard.tsx` sizes hero art by available **width**, capped at 360 points; the default frame is 1.5 times that height. The shared native fixture demonstrates how much of the first viewport the card consumes. Both live Arena and Profile reuse it, adding their own headers, names, stats and actions. This makes stats and Customize/Cosmetics require substantial scrolling, especially on short phones.

Recommended change: derive a maximum art height from the usable viewport, retain the entire fighter inside its measured frame aperture, and tighten header/caption spacing. Keep urgent battles before the hero and keep Battle reachable in the tab bar. Validate actual live-route positions with a full-body equipped frame at small/default/large text before selecting a final size. The fixture uses bundled archetype art and extra development controls, so its exact vertical positions are not production measurements.

### R2 — Rankings, battle rows and rivals: carry real fighter identity (medium)

`components/PodiumHeader.tsx`, `app/(tabs)/rankings.tsx`, `app/(tabs)/battles.tsx` and `components/profile/RivalRow.tsx` use stock archetype illustrations. `utils/publicPlayers.ts` exposes archetype, signature colour and cosmetics, but no generated avatar reference. The frame/colour is recognizable; the actual fighter is not consistently represented.

Recommended change: use existing battle identity snapshots for battle rows where available, and define a safe owner-authorized/public avatar-reference contract for Rankings and rivals. Reuse signing/cache/retry behavior and preserve archetype fallbacks. Do not bypass character RLS or expose private storage paths. This is a data-contract task, not a client-only icon replacement.

### R3 — Battle theme art: more environmental storytelling (medium / art polish)

The title, backdrop, custom moves and duel composition are implemented. However, `constants/ThemeArt.ts` hashes arbitrary theme text into six bundled mood packs; it does not select a scene depicting the theme. The native “Last Library” sample therefore shows abstract violet art rather than the painted environment suggested by the approved reference.

Recommended change: review the six bundled environment compositions and the plaque crop/scrim together. Prefer stronger landscape/environment imagery with useful details on the visible right side. Keep text readable and the existing deterministic fallback. Do not imply a scene is generated for each theme or add runtime generation to the battle loop.

## Screen/state coverage

“Source” means presentation composition and contracts inspected; it does **not** mean a complete native walkthrough. “Shared native fixture” means the actual reusable components rendered with local synthetic data, outside authenticated routes.

| Screen | Coverage and disposition |
| --- | --- |
| Arena | Source + shared native card/header; R1 remains. Urgent-round placement/custom action glyphs retained. |
| Profile | Source; shares the hero covered by R1. Account navigation glyphs already use the custom family. |
| Battles | Source; active/history status hierarchy and recovery retained. Stock portraits covered by R2. |
| Rankings | Source; scalable podium/list and small-population handling retained. R2 remains. |
| Mode picker | Source; shared controls, mode descriptions and fallbacks retained. |
| Matchmaking | Source; fighter entrance and essential footer retained. No new mandatory step. |
| Battle workspace | Source + shared native duel/theme/move controls; R3 remains. Concurrent workspace work preserved. |
| Waiting | Source; shared duel, localized deadline and Return to Arena footer retained. |
| Round result | Source; outcome hierarchy, details and pinned Continue retained. |
| Series result | Source; essential footer, appeal/revision presentation retained. Concurrent result work preserved. |
| Sign-in | Source; quieter form chrome applied. Native Apple sign-in untouched. |
| Sign-up | Source; quieter form chrome applied. Age gate and validations untouched. |
| Password reset | Source; quieter form chrome applied. Request/success/error flow untouched. |
| Welcome | Source; brand illustration and starter/customize actions retained. |
| Create fighter | Source + native shared item grid; consistent artwork applied, selection semantics retained. |
| Edit Look | Source + native Look/Fighter/writing/archetype sheet at 402 points; Look at 375 points and style sheet at accessibility text. Adjustments above. |
| Cosmetic Shop | Source + shared native tabs/collection/loadout; terminology corrected. Price/equip/retry behaviors unchanged. |
| Stats | Source; panel emphasis reduced. Actual recent-data window labels remain. |
| Wallet | Source; quiet panels, localized full-width offers, pending purchase/ledger states retained. No billing actions tested. |
| Settings | Source; existing custom navigation glyphs and native switches retained. |
| Blocked users | Source; quiet rows, explicit actions and state feedback retained. |

Startup, root/tab shell, overlays and legacy redirects were checked through their shared presentation consumers. No former face-off/move-selection route was reintroduced.

## Validation and limits

- Final Jest: **164 suites / 1,361 tests**, no snapshots. Existing draft, navigation, tutorial, history, media, wallet, cosmetic and appeal-display suites remain green.
- Focused behavioral tests exercise archetype-sheet opening/closing, retained options, staging, arriving locks, cooldown inspection, unknown saved presets and all art styles from written mode.
- TypeScript: passed. ESLint: zero errors; full lint retains the existing `app/_layout.tsx:29` require-import warning. Explicit lint of changed controls/tests/fixtures passes.
- Fixture isolation script and diff whitespace checks pass.
- Native fixture screenshots: iPhone 17 Pro 402×874 and dedicated small phone 375×812. The accessibility style-sheet capture uses Accessibility Medium (approximately 1.79 scale); its original text-size setting was restored. The image-sizing fix was inspected at standard and accessibility sizes. Earlier overview screenshots show the same controls before the final proportional-image refinement.
- Screenshots are development fixtures, with synthetic balances/prices and no live account mutation. DEV controls, the Expo floating button and system status bar are not product chrome. The writing screenshot does not demonstrate a software keyboard walkthrough.
- Android validation remains **blocked** under the user's existing instruction. Full VoiceOver/TalkBack, Reduced Motion, software-keyboard, production payment/provider, performance and complete real-route state checks were not rerun in this bounded consistency pass. This report does not satisfy the full release acceptance matrix.
- No version bump, production build, store submission, backend deployment, new asset generation or combat/appeal flag change. Unrelated battle/video/suggestion/audio changes remain intact.
