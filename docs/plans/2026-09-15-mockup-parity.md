# Prompt Wars — Mockup Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow current delegation permissions; this plan does not request parallel agents.

**Goal:** Close the 22 documented visual gaps between the current client and the three approved collectible-game mockups, then carry the corrected shared language through the complete 21-screen inventory.

**Architecture:** Change presentation components around existing hooks, navigation, authenticated helpers and interaction state. Build custom vector icons and distinct visual treatments once, then compose the Arena card, battle workspace and Shop from those primitives. Preserve measured frame apertures and live native text. Do not rebuild game, purchase or draft state machines.

**Tech stack:** Expo SDK 55, React Native, Expo Router/React Navigation, existing Barlow Condensed fonts, react-native-svg, existing motion tools, Jest/React Native Testing Library, iOS/Android native acceptance.

**Spec:** [Evidence and 22 findings](../audits/2026-09-15-mockup-parity/README.md). References: [Arena](../../output/mockups/2026-09-14-collectible-direction/arena.png), [battle workspace](../../output/mockups/2026-09-14-collectible-direction/battle-workspace.png), [Shop](../../output/mockups/2026-09-14-collectible-direction/cosmetic-shop.png). This refines the [complete visual migration](2026-09-15-complete-visual-migration.md); existing behavior and release gates remain applicable.

## Implementation tracking

Source work for Tasks 2–7 and shared propagation in Task 8 is implemented. Task 1 has a guarded local native fixture harness. Native acceptance is tracked per ID in [acceptance.md](../audits/2026-09-15-mockup-parity/acceptance.md); unchecked mixed implementation/native items retain their native gate. Do not interpret source completion as release approval.

## Global constraints

- Work from the current working state. Preserve earlier integrity, UX, cosmetic and recovery changes. Do not reset, broadly reformat, or sweep unrelated files into a commit.
- Client presentation only: no schema, Edge Function, combat, appeal, pricing, entitlement, matchmaking-contract or rollout-flag changes.
- Preserve the raised central **Battle** action, four persistent tabs, tab/scroll state, deep-link fallbacks, free exits, draft ownership and authoritative results.
- Keep every product, equipment slot, earned alternative, paid-ranked suggestion disclosure, creator mode, safety action and recovery path. Static reference omissions do not remove features.
- Preserve existing audio-provider changes, app icon, generated-video branding, bundled artwork and font integration. Do not regenerate fighter/frame assets or add another font.
- Essential values remain dynamic native text. Do not rasterize headings, prices, HP, deadlines or input content into screen images. Decorative SVGs cannot receive touches or duplicate screen-reader focus.
- Shared controls retain at least 48-point targets. Preserve OS font scaling, normal-text contrast of 4.5:1 and large-text contrast of 3:1. Accessibility adaptations are deliberate layouts, never accidental 3+1 stat wrapping or clipped prices.
- Match the composition, materials and hierarchy at real phone sizes. Do not squeeze all content into one viewport to reproduce a static image.
- Current version is already 1.3.0. This refinement needs no independent version bump or backend deployment. Distribution remains a later gated step under the existing acceptance record.

## Reference contract and scope

Only Arena, battle workspace and Shop have approved screen images. Profile and the other 17 routes inherit their components; no fabricated pixel reference is implied. Distinguish four categories when reviewing a screenshot: missing visual treatment, intentional accessibility adaptation, different live data, and existing functionality omitted by the reference.

The ordinary-size targets are:

| Surface | Required composition |
|---|---|
| Arena | Brand/balance/avatar masthead → display heading and ruled subtitle → action-needed strip when applicable → one fighter/nameplate/stat assembly → Customize/Cosmetics → existing secondary content. |
| Fighter stats | Four equal columns with three gold vertical dividers; label above value; no inter-cell gap arithmetic causing wrap. |
| Workspace | Labeled exit/overflow → round and mode heading → mirrored fighter/HP/score strip → illustrated theme → exact deadline → move tiles → writing panel → persistent lock-in footer. |
| Shop | Back/wordmark/balance → heading/subtitle → compact equipped summary → underlined category rail → joined All/Owned → naturally scrolling collection → quiet fairness footer. |
| Root navigation | Four custom destination symbols and labels, gold selected underline, central raised violet crossed-quill Battle action. |

Pending rounds remain ahead of the Arena hero by prior agreement. The example Mira/Rook identities, Astral equipment, balances, prices and Last Library theme are sample data, not values to substitute into live accounts.

## Component responsibilities and interfaces

Create these small presentation units; reuse existing implementations where noted:

| Unit | Responsibility / contract |
|---|---|
| `components/game/icons/GameIcon.tsx`, `glyphs.tsx` | Typed custom SVG family; `name`, `size`, `color`, optional accent. Icon is decorative by default; its parent owns the accessible label. Use one canonical name per purpose. |
| `components/game/GameDisplayTitle.tsx` | Native measured display text, screen/theme finish, casing only for authored UI headings, optional ruled subtitle through GameHeader. Visible system-text fallback on font/render failure. |
| `components/game/GameMasthead.tsx` | Existing back node, brand node, balance node and optional avatar node. Responsive placement only; no navigation, account fetch or credit fetch inside it. |
| Existing `GameButton`, `GameNavRow`, `GameBevel` | Add custom icon support and explicit chrome variants while retaining forwarded refs, handlers, disabled/busy/focus semantics and existing tones. |
| `components/game/FighterStatTray.tsx` | `stats: StatBlock`, measured available width, font scale. Explicit four-column or balanced two-by-two mode, native labels/values and decorative rules. |
| Existing `FighterCard` / `ArenaFighter` | Join existing artwork, identity plate and stat tray; retain identity, cosmetics, image recovery, compact/hero/collection contracts. |
| `components/game/battle/BattleMoveTile.tsx` | `move`, `selected`, `onPress`, optional unavailable state. Own move-colored bevel/glyph/check; radio semantics. Does not own the selected move. |
| Existing `VersusStrip`, `BattleThemePlaque` | Compose real snapshots/HP/score and visible decorative theme art. No invented round or theme data. |
| `components/game/battle/BattleLockInControl.tsx` | Present existing hold progress and submit status with existing press/confirmation handlers. No second timer, validation path or submit mutation. |
| `components/shop/ShopCategoryTabs.tsx` | Controlled category value/change using existing category keys, tab semantics and selected-tab scroll reveal. |
| `components/shop/ShopEquippedSummary.tsx` | Current category equipment summary with portrait; expand existing complete loadout. Colors route to the current character-edit flow. |
| `components/shop/ShopFilterControl.tsx` | Controlled All/Owned two-part selection; no item filtering logic inside. |
| `components/shop/ShopTrustFooter.tsx` | Shield-check and ruled, centered cosmetics statement; no interaction or entitlement logic. |
| Existing `components/shop/ShopItem.tsx` | Artwork with native metadata plaque, explicit Preview and existing preview/purchase/equipment footer behavior. |

For button/menu migration, add `gameIcon?: GameIconName` alongside the current `icon` prop, render one with explicit custom-icon precedence, and migrate callers by inventory. Keep library-only utility callers working during the waves. Remove obsolete props only after every consumer has migrated; replacing unrelated native/system UI is out of scope.

Add a `gameIcon` key to move presentation metadata without altering `beats`, `losesTo` or any move wire value. Use the same custom move symbols in selection, chips and results. Do not give battle logic a dependency on SVG components.

## Task 1 — Record comparable fixtures and measurable acceptance

**Addresses:** V2; establishes the acceptance contract for every other task.

**Files:** create `docs/audits/2026-09-15-mockup-parity/acceptance.md`; use the existing screenshot directory and `docs/VISUAL_MIGRATION_ACCEPTANCE.md`; add reusable local fixture data at `test-support/fixtures/mockupParity.ts` when implementation begins.

- [ ] Record viewport, OS, text scale, equipment, font availability, network state and scroll position beside each before/after capture. Identify development-runtime versus freshly compiled native evidence.
- [ ] Define local fixture data using existing battle/character/cosmetic types: short Latin names, diacritics, non-Latin names, long unbroken names, maximum stats, long prices/deadlines, no equipment, circular equipment and full-body equipment. Keep all fixture mutations stubbed.
- [ ] Include workspace single/Bo3, human/practice, player-one/player-two, zero/nonzero series score, long theme, each move, guided/custom writing, draft failure, submit failure and keyboard states.
- [ ] Capture a fresh editable workspace using local fixture composition or an authorized staging fixture. The current audit has no fresh editable-workspace screenshot. Do not silently create a production ranked match, spend credits or change equipment just to populate evidence.
- [ ] Capture reference components at widths 375, 390 and 430 with default text, then at 320 and accessibility text sizes. Include a font-unavailable capture. Use the same fixture on both sides of a comparison where possible.
- [ ] Record actual native bounds for stat cells/dividers, move controls, category targets, portraits and footer. Jest cannot establish native flex layout or text clipping.
- [ ] Set the review rule: each audit ID closes only with an observed matching result or a named justified accessibility/data exception. A passing test suite is supporting evidence, not visual acceptance.

**Independent gate:** a reference/evidence matrix exists, fixtures are repeatable without production writes, and all 22 IDs have an explicit acceptance target.

## Task 2 — Custom icons, display hierarchy and material variants

**Addresses:** G1, G2, G3, G4 foundation.

**Create:** `components/game/icons/{GameIcon,glyphs}.tsx`, `components/game/GameDisplayTitle.tsx`, `components/game/GameMasthead.tsx`, `__tests__/gameIcons.test.tsx`, `__tests__/gameDisplayTitle.test.tsx`.

**Modify:** `constants/DesignTokens.ts`, `components/game/{GameButton,GameNavRow,GameBevel,GameHeader,BrandMark}.tsx`, `components/game/index.ts`, `components/CreditChip.tsx`, existing `__tests__/gameFoundation.test.tsx`.

- [x] Draw a coherent original vector family matching the reference silhouettes: arena gateway; crossed battle blades; rankings bars; profile bust; hanger/customize; mask/cosmetics; faceted crystal; quill/lock-in; scroll/action-needed; attack bolt; defense shield; finisher skull; shield-check. Extend the same stroke/cut language to wallet, stats, settings, blocked users, share, replay and editor menu destinations.
- [ ] Use consistent optical size, chamfered geometry, negative space and limited gold/lavender accents. Inspect each icon at its actual small navigation size as well as the larger move size; recognition must survive grayscale.
- [x] Add typed icon support to shared button/menu components. Confirm an icon never suppresses an independent selected marker or busy indicator.
- [x] Define separate `action`, `collection`, `utility` and `text` chrome variants while preserving existing primary/secondary/danger tone semantics. Primary uses a lavender bevel and dark ink; Preview uses a quiet lavender edge; utility actions are restrained; confirmation alternatives are underlined text with a 48-point hit area.
- [x] Give GameBevel an explicit stroke/fill contract; callers must not depend on a View borderColor changing the inner SVG border. Add gradient/edge details using existing SVG tools, not a new full-screen bitmap.
- [x] Implement large uppercase authored screen headings and gold italic theme headings using the existing display face. Keep player names unchanged. Preserve measured multiline layout and native header semantics.
- [x] Prototype the metallic title finish with existing SVG decoration and measured native text. Any decorative text paint must be non-accessible and synchronized to native wrapping; native text remains the measurement/accessibility source and the visible fallback if font or paint cannot render. No fixed-width SVG label may clip dynamic content.
- [x] Compose masthead slots so logo, balance and back label do not overlap. Arena gets its existing fighter avatar; Shop gets a centered wordmark and visible back destination. Large text can move balance to another row. Keep live balance and existing opener-aware back behavior.
- [ ] Add behavioral tests for decorative focus exclusion, visible label, busy/disabled callbacks, selection marker with icon, text/font fallback and long masthead content. Review an actual native icon/contact sheet and title/control strip before broad migration.

**Independent gate:** icons are recognizable and visually consistent; materials are distinct; primary/disabled/selected/focus states pass contrast and semantic checks; fonts cannot hide text.

## Task 3 — Unified Arena/Profile fighter card and four-stat strip

**Addresses:** A1, A2, A3; applies G2/G4 to Arena.

**Create:** `components/game/FighterStatTray.tsx`, `__tests__/fighterStatTray.test.tsx`.

**Modify:** `components/game/{FighterCard,ArenaFighter}.tsx`, `components/profile/FighterHero.tsx`, `app/(tabs)/{home,profile}.tsx`; extend `__tests__/{fighterCard,arenaFighter,fighterHeroFrames}.test.tsx`.

- [x] Replace percentage minimum widths plus flex wrapping with explicit rows of equal-width cells. Four columns use `flex: 1`, `minWidth: 0`, no inter-cell gaps; rules sit between cells rather than consuming unbudgeted percentage width.
- [ ] At default text sizes, support all four English labels on a single row at ordinary phone widths. Measure the available content width; remove excess inset before forcing a different layout. Do not disable scaling, shrink essential text or truncate stat names.
- [x] Use a deliberate 2×2 mode when text scale exceeds 1.15 or the measured row cannot fit complete labels. Keep Strength/Stamina then Agility/Focus order, balanced cell widths and appropriate internal dividers. Never render an accidental 3+1 row.
- [x] Attach the gold-rule stat tray to the fighter identity plate and artwork silhouette. Use an inset nameplate and compact archetype line; retain title, badge, battle cry and signature-item identity in a supporting area with measured height.
- [x] Keep `CosmeticFrame` and its measured apertures responsible for equipped art. Add local violet atmosphere outside the artwork aperture without stacking an extra ornamental frame. Full-body art stays contained; compact surfaces use the avatar.
- [x] Replace Customize/Cosmetics stock icons with larger hanger/mask glyphs and trailing chevrons. Keep both real destinations and adequate independent targets.
- [x] Restyle the action-needed entry as the illustrated scroll/attention strip. Keep its actual actionable count and prior placement above the hero. Preserve secondary Arena quests, offers, rivals and theme-after-matching copy.
- [x] Reuse the assembled card on Profile; do not fork a second near-identical stat implementation.
- [ ] Test complete labels/values/order, deliberate layout-mode selection, long names, unchanged data, artwork failure and frame reuse. Verify native cell x/y bounds: all four align at default size; two equal rows appear in the accessible layout; three vertical rules are visible in the four-column case.

**Independent gate:** default-size Arena matches the one-card/one-stat-strip hierarchy; Focus is on the first row; Profile preserves the same fighter/equipment and the accessible layout is deliberate.

## Task 4 — Root navigation and destination menus

**Addresses:** N1; G1/G3/G4 consumer migration.

**Modify:** `components/ArenaTabBar.tsx`, `app/(tabs)/_layout.tsx`, `components/game/GameNavRow.tsx`, `components/SegmentedCategoryBar.tsx`, Profile/Settings menu callers, `components/PracticeReplayButton.tsx`; extend `__tests__/{navigationPresentation,segmentedCategoryBar,headerFallback}.test.tsx`.

- [x] Replace flame/game-controller/trophy symbols with gateway/crossed-blades/ranking-bars and the custom Profile mark. Reuse the existing crossed-quill brand identity for the raised middle action.
- [x] Remove the resting selected-tab box; use the mockup's gold icon/label and short underline. Retain a distinct keyboard focus outline and selected accessibility state.
- [x] Match the attention badge to the compact reference styling without hiding counts or including ordinary waiting states. Retain measured label height and the central reserved slot.
- [x] Migrate Profile/Settings/editor destination icons to the same family. Preserve unsaved-change badges, native switches, external-link semantics, busy/disabled states and destructive confirmations.
- [x] Keep BottomTabBar events, long press, prevented press, deep links and scene state unchanged. Do not rebuild the router or hide the center Battle label.
- [ ] Run navigation harness tests and a native Arena → Profile → Settings → Back round trip. Verify scroll retention, cold fallback destinations and opening/dismissing Battle without changing the selected tab.

**Independent gate:** custom nav/menu glyphs and gold underline match the reference; the raised central Battle action and navigation behavior remain intact.

## Task 5 — Battle header, duel, theme and move selection

**Addresses:** B1–B5; applies G1–G3.

**Create:** `components/game/battle/BattleMoveTile.tsx`; extend `__tests__/{battleVisualControls,battleWorkspaceLayout}.test.tsx`; add `__tests__/battleMatchupPresentation.test.tsx`.

**Modify:** `app/(battle)/prompt-entry.tsx`, `components/{VersusStrip,HPBar,SeriesScoreIndicator}.tsx`, `components/game/battle/{BattleThemePlaque,BattleMovePicker}.tsx`, `constants/MoveTypes.ts`.

- [x] Use the display header for the real round number and total, with the actual mode and first-to-two subtitle for Bo3. Practice visibly says AI opponent/Practice; legacy single battles omit Bo3-specific copy.
- [x] Recompose the duel strip into mirrored portrait/identity/HP plates with central diamond VS and the real round-win score. Increase useful portrait prominence on ordinary phones; do not require a 560-point width for the intended inline composition.
- [x] Use viewer/opponent orientation consistently for names, max/current HP and series score. Hide unavailable legacy metadata rather than inventing zeros. Keep complete names, avatar openers and safety actions reachable.
- [x] Use a chamfered portrait window for the default treatment. When equipment specifies a circular avatar frame, preserve that frame's real aperture and silhouette instead of stretching it into a rectangle. Document this as a data-driven reference exception.
- [x] Replace the uniform 82% theme cover with a localized dark-to-transparent scrim over existing bundled art. Keep a visibly illustrated region to the right. Use the gold italic title treatment and enough height for a long authoritative theme.
- [x] Keep existing deterministic theme-to-art selection and audio mapping untouched. The free-text theme is the title; show separate descriptive copy only if the real payload has it. Do not fabricate short scene names or explanatory briefs.
- [x] Place the exact localized deadline immediately below the theme. Consolidate repeated score/deadline context while preserving expiration warnings and accessibility announcements. Show one integrated series score in the duel header.
- [x] Build three move tiles with custom bolt/shield/skull, matching ember/cyan/violet bevel and glow, bold label, and a separate selected check. Keep explicit move labels and current beats relationships.
- [x] Use three columns when measured width/text fits; otherwise use a deliberate stacked layout. Selected color must drive the actual bevel SVG. Keep the selection outside editor mount identity and preserve all current change handlers.
- [ ] Verify source-derived metadata for both player orientations, practice and single/Bo3 fixtures. Verify custom selection marker, actual bevel-color input and unchanged editor instance on move switches. Capture native workspace pairs with default/large text and long themes.

**Independent gate:** the normal workspace has the reference's round → duel → theme → deadline → move hierarchy; artwork is visible, server values agree and selecting a move produces a clear shape/color/check change.

## Task 6 — Writing hierarchy and lock-in action

**Addresses:** B6, B7.

**Create:** `components/game/battle/BattleLockInControl.tsx`, `__tests__/battleLockInControl.test.tsx`.

**Modify:** `app/(battle)/prompt-entry.tsx`, existing relevant GameField/footer presentation; extend `__tests__/battleWorkspaceLayout.test.tsx`, `__tests__/useBattleDraft.test.tsx` and `__tests__/battleDrafts.test.ts`.

- [x] Group YOUR PROMPT and Ideas in one header; arrange current authoring-mode selection as subordinate controls. Keep the editor a spacious, quiet native input surface.
- [x] Place saved/unsaved/failed draft status and discard action beneath writing with clear hierarchy. Keep free allowance, next-set price and extra-suggestions disclosure visible at the paid decision point; never hide charges in decorative expansion.
- [ ] Collapse decorative fighter content with the keyboard as currently required. Maintain one keyboard-inset owner, visible caret and reachable submission control; opening ideas or switching moves must not remount or clear the editor.
- [x] Extract only lock-in rendering around the current hold handlers/progress. Use the custom quill, metallic lavender face, `HOLD TO LOCK IN` ready label and a ring/edge progress treatment. Keep hold duration, cancellation and submission checks unchanged.
- [x] Map unavailable, ready, holding, submitting, failure and submitted presentation to the actual existing state. Do not leave the ready gradient active while submission is impossible. Expose accessible disabled/busy status and a useful reason.
- [x] Use a quiet underlined confirmation alternative with its existing confirmation flow and at least 48-point target. Keep the editability note accurate. Screen readers can submit through confirmation without performing a timed gesture.
- [ ] Test hold cancellation, exactly-once submission, unavailable/busy blocking, failed-submit draft retention and confirmation. Exercise move switching while typing, navigation/background restoration and keyboard reachability on a real simulator/device.

**Independent gate:** writing stays stable; the action resembles the reference and its progress/state is truthful; failed or canceled submission never loses text.

## Task 7 — Shop tabs, equipment summary, collection and trust footer

**Addresses:** S1–S5; applies G1–G4.

**Create:** `components/shop/{ShopCategoryTabs,ShopEquippedSummary,ShopFilterControl,ShopTrustFooter}.tsx`, `__tests__/shopCategoryTabs.test.tsx`.

**Modify:** `app/(profile)/shop.tsx`, `components/shop/ShopItem.tsx`, `components/CosmeticPreview.tsx`; extend `__tests__/{cosmeticShopScreen,cosmeticShopRecovery,cosmeticPreview}.test.tsx` and `__tests__/collectionLayout.test.ts`.

- [x] Apply the masthead, display heading and ruled subtitle. Remove the fairness statement from the title area.
- [x] Replace the expanded default loadout with a compact illustrated summary for the selected category: `Wearing [name]`, slot/equipped state and chevron. No equipment gets truthful empty copy. Expand to the existing complete loadout so every slot remains discoverable.
- [x] Keep the color category's actual edit-character behavior. Owned colors do not acquire a new equip API or fictional equipment slot.
- [x] Replace category buttons with an underlined rail: Frames, Titles, Auras, Badges, Colours. Preserve keys `frame`, `title`, `avatar_effect`, `badge`, `color`; selected state and content must remain controlled by the current screen/hook.
- [x] Give tabs native tab/tablist semantics and 48-point hit areas. Fit all five at ordinary widths where complete labels fit; otherwise scroll horizontally. Reveal the selected tab when selection/width/text scale changes. Avoid truncation or unrelated wrapped button rows.
- [x] Replace All/Owned buttons with a joined two-part filter. Keep existing category/filter persistence, selection semantics, loading, error/retry and empty-owned messages.
- [x] Recompose item tiles: artwork → name → rarity plus ownership/equipment or full price → earned alternative → wide quiet Preview. Use custom crystal/check markers, balanced native metadata and dynamic tile height. Align Preview controls without truncating names or prices.
- [x] Preserve two columns only at width ≥390 and font scale ≤1.15; otherwise use one. Let the collection scroll. Keep existing catalog order and every item; the four showcase frames in the reference do not authorize removing or repricing older products.
- [x] Keep tiles non-actionable containers. Preview remains explicit; Buy/Equip/Remove stay in the preview's persistent footer with purchase confirmation and existing recovery logic. Preview every frame on the same fighter without changing equipment.
- [x] Add the centered ruled shield-check footer **after the collection or its empty state**: `Cosmetics never affect battle stats.` It scrolls with content and is separate from transactional disclosures.
- [ ] Test all five categories, All/Owned, selected-tab reveal, empty/loading/error states, complete equipment access, color routing, preview-only tile semantics, delayed purchase/equip refresh and no duplicate actions. Review native header and collection pairs at normal and large text sizes.

**Independent gate:** the Shop reads as an equipment strip, tabbed collection and quiet trust footer; metadata follows the mockup hierarchy while pricing and all equipment behaviors are preserved.

## Task 8 — Propagate and perform complete visual/behavior acceptance

**Addresses:** V1, V2; closes all shared consumers and validates G1–S5.

**Modify:** shared-component consumers in the complete route/overlay inventory below; `docs/DESIGN_LANGUAGE.md`, relevant visual-only sections of `docs/prompt-wars-implementation-concept.md`, `docs/VISUAL_MIGRATION_ACCEPTANCE.md`, and the parity acceptance matrix. Preserve unrelated product/economy text.

| Consumer group | Files / checks |
|---|---|
| Battle lifecycle | `app/(battle)/{matchmaking,waiting,round-result,result}.tsx`, `components/{FaceOffPortraits,FighterEntrance,RoundResultCinematic,SeriesScoreIndicator}.tsx`: fighter identity, duel/HP, move symbols, outcomes and persistent actions. |
| Move reuse | `components/{MoveTypeSelector,MoveTypeChipRow,MoveUsageChips}.tsx`, `components/reveal/{MoveSting,RevealJudgeBeat,RevealWinnerBeat,RevealVerdictBeat,RevealPayoffBeat}.tsx`: same glyph family and outcome colors; no score/audio changes. |
| Competition | `app/(tabs)/{battles,rankings}.tsx`, `app/(profile)/stats.tsx`, podium, rival and quest components: compact cards, custom destination/status marks, complete values and existing empty/data-window states. |
| Account/creator | `app/(auth)/{sign-in,sign-up,reset-password}.tsx`, `app/(onboarding)/{welcome,create-character}.tsx`, `app/(profile)/edit-character.tsx`, `components/edit-character/`: titles and icons with quiet forms; all original steps and recovery. |
| Utilities/navigation | `app/create.tsx`, `app/(profile)/{wallet,settings,blocked}.tsx`, Profile menu and shared headers: custom game marks, readable payments/controls, native system surfaces preserved. |
| Overlays/startup/share | Existing sheets, report/block, forfeit, draft discard, purchase, offer, tutorial, portrait/render viewers, toast/error, `app/index.tsx`, `components/ResultShareCard.tsx`: appropriate shared chrome, focus, action reachability and current adjudication revision. |

- [x] Search remaining stock-icon consumers and classify each. Replace app/game destinations and move/action symbols with the family; common utility marks can remain only as explicit consistent exceptions. Native Apple/payment/permission UI remains native.
- [ ] Verify all 21 existing routes and additional startup/redirect/overlay states against the original acceptance inventory. Do not recreate mandatory face-off or move-select routes.
- [ ] Update the design language with icon mapping, title/button variants, stat rules, Shop tabs/footer and image-scrim composition. Add exact before/after evidence per audit ID with no blanket “visual migration complete” assertion.
- [ ] Run focused tests after each changed unit; after integration run TypeScript, ESLint and the complete existing Jest suite. Do not rerun backend/Deno tests for a presentation-only change unless backend/shared combat code was actually touched, which is outside this plan.
- [ ] Repeat behavioral acceptance for tab/back/cold links, editor identity, draft save/failure/restart, hold/confirmation, tutorial continuation, delayed purchases, equipment/artwork retry, media recovery, result revisions and sharing.
- [ ] Capture native default/accessibility text, small phone, software keyboard, VoiceOver/TalkBack, Reduced Motion, foreground/background and cold/offline font cases. Inspect art contrast on actual imagery, not only palette tokens.
- [ ] Compare same-device scrolling, typing, transitions and memory against the existing baseline. Effects stay local and stop off-screen/backgrounded; no glow loops over lists or keystroke-driven animation.
- [x] Record Android validation as **blocked** until an Android environment is available, per the user's instruction. Do not interpret finishing implementation as a waived Android pass. Fresh native font/splash and the rest of the matrix also retain their existing gate.

### Verification commands

Run from the repository root; RTK wraps commands per repository instructions. Add newly introduced test files to the relevant focused run.

```sh
rtk proxy yarn test --runInBand __tests__/gameFoundation.test.tsx __tests__/fighterCard.test.tsx __tests__/navigationPresentation.test.tsx
rtk proxy yarn test --runInBand __tests__/battleVisualControls.test.tsx __tests__/battleWorkspaceLayout.test.tsx __tests__/useBattleDraft.test.tsx
rtk proxy yarn test --runInBand __tests__/cosmeticShopScreen.test.tsx __tests__/cosmeticShopRecovery.test.tsx __tests__/collectionLayout.test.ts
rtk proxy yarn tsc --noEmit
rtk proxy yarn lint
rtk proxy yarn test --runInBand
```

Meaningful new checks cover accessible labels/states, one event per action, retained editor instance, complete data, orientation, explicit layout-mode selection and recovery. Styling snapshots alone cannot prove parity. Native measured bounds and actual screen review must catch the stat wrapping and category composition failures that escaped prior automated checks.

## Coverage and completion checklist

| Audit IDs | Implementation task | Evidence needed to close |
|---|---|---|
| G1 | 2, 4, 5, 7, 8 | Custom icon contact sheet plus actual nav/action/move/menu captures. |
| G2 | 2, 3, 5, 7 | Arena/round/Shop/theme title comparison and native multiline/font fallback. |
| G3 | 2, 5, 6, 7 | Distinct primary, Preview, move, utility and text-action state examples. |
| G4 | 2, 3, 7 | Masthead with visible back label, brand, balance and optional avatar; long-value case. |
| A1 | 3 | Native four equal cells + three dividers; deliberate accessible 2×2. |
| A2 | 3 | Unified art/nameplate/stat silhouette with default and equipped frames. |
| A3 | 3 | Custom paired actions and illustrated action-needed strip with real count. |
| N1 | 4 | Custom navigation, gold underline, badge and raised central Battle; round-trip test. |
| B1 | 5 | Correct round/mode heading for ranked, practice and single. |
| B2 | 5 | Mirrored portraits/HP/VS/score with both player orientations and frame exceptions. |
| B3 | 5 | Visible theme art, gold title, readable long authoritative theme. |
| B4 | 5 | Exact deadline below theme and one primary score location. |
| B5 | 5 | Three bespoke move cards, move-colored visible bevel and independent check. |
| B6 | 6 | Writing/Ideas/draft hierarchy; same editor survives changes and keyboard. |
| B7 | 6 | Quill/progress lock-in, truthful states and accessible confirmation. |
| S1 | 7 | Compact illustrated equipment summary and access to every slot/color edit. |
| S2 | 7 | Underlined tab rail; selected semantics and accessible scroll reveal. |
| S3 | 7 | Joined filter, preserved state and empty/retry cases. |
| S4 | 7 | Art/name/rarity/status/price/earned/Preview composition with long values. |
| S5 | 7 | Exact fairness copy in ruled shield-check footer after content. |
| V1 | 8 | All 21 routes and app-owned overlays mapped to corrected shared components. |
| V2 | 1, 8 | Comparable native evidence with status/exception per ID, separate test results. |

- [ ] Every ID is closed or explicitly blocked with evidence; no pending visual gap is hidden behind “tests passed.”
- [ ] No lost features, draft/submission/navigation regression, equipment mismatch or second purchase path was introduced.
- [ ] The central Battle action remains and existing audio-provider work is untouched.
- [ ] The three reference screens receive a final composition review at ordinary text size before accessibility variants are accepted as exceptions.
- [ ] Public distribution waits for the original native acceptance and release authorization requirements. Do not start a cloud upload or store submission as part of this audit/plan.

**Out of scope:** new combat rules, extra theme generation/catalog, catalog merchandising changes, automatic purchases/equips, redesigning native system UI, new fonts, new app icon, regenerated fighter/frame art, backend rollout, and releasing a partial visual pass.
