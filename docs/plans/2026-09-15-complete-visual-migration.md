# Prompt Wars — Complete Visual Migration

Approved implementation specification, 15 September 2026. Source: the user's complete migration plan in this task. Visual reference: `output/mockups/2026-09-14-collectible-direction/index.html` and its three PNGs.

## Global constraints

- Migrate all 21 existing screens plus startup states, app-owned overlays, free result cinematics and new share cards. Keep the current app icon and generated-video branding.
- Retain every existing feature, game rule, price, entitlement, recovery behavior, legacy route, server-owned outcome, moderation and appeal control. No database migration, Edge Function deployment, combat/appeal flag change or matchmaking contract change.
- Preserve current working state, including earlier UX/integrity/cosmetics changes. Do not change `providers/BattleAudioProvider.tsx` or its tests.
- Keep raised central Battle action surrounded by Arena, Battles, Rankings and Profile. Preserve stack/tab state, scroll, fallback routes and draft-safe exits.
- Obsidian surfaces, restrained gold edging, violet/lavender actions with dark ink, readable system body text, Barlow Condensed Bold/ExtraBold Italic display. Body/input default16; normal contrast4.5:1, large3:1; shared targets>=48; OS scaling enabled.
- Existing art is reused. Dynamic UI stays native; only decorative imagery and branding use generated assets. Hero art is contained and avatars use avatar assets. Existing frame apertures remain authoritative; do not double-frame equipped cosmetics.
- Existing motion tools only; focused entrances/selection/lock-in/results; pause on blur/background and honor Reduced Motion. No continuous ambient animation or keyboard-driven effects.
- Use existing hooks/helpers for reads/mutations. Existing audio, video providers, wallets, snapshots, account-scoped drafts and purchase/media recovery remain intact.

## Task 1: Shared visual foundation

Create reusable native GameText, GamePanel, GameButton, GameField, GameHeader, GameFooter, GameScreen and decorative bevel primitives in `components/game/`. Extend `constants/DesignTokens.ts` and `constants/Colors.ts` with semantic collectible styling, updating `hooks/useThemedColors.ts` variants if types require. Body fields stay system text; native typography for display with unsupported-script/system fallback. Style variants and controls expose selected, disabled, unavailable and busy states with accessible labels. Reuse existing SVG and font dependencies. Avoid changing screen files; controller migrates screen consumers.

Expected exports from `components/game/index.ts`: GameText (TextProps + variant body/label/caption/title/display/fighter); GamePanel (ViewProps + tone quiet/ornate/selected); GameButton (Pressable-compatible handlers + label, optional Ionicons icon, tone primary/secondary/danger, busy); GameField (TextInputProps + optional label/error); GameHeader (title, subtitle?, leading?, trailing?); GameFooter (children, keyboardVisible?, style?); GameScreen (children, footer?, scroll?, contentContainerStyle?, style?, safeTop?, safeBottom?, testID?). Defaults must preserve OS scaling and 48-point targets. Document exact implemented contract.

Test meaningful accessible control behavior, font fallback, light/dark/high-contrast pairing and invalid/disabled/busy states. Native UI styles need not receive mirror/snapshot-only tests.

## Task 2: Reference screens

Arena, Profile, Shop and the root navigation receive shared card hierarchy; battle workspace is handled with Task3. Create shared FighterCard hero/compact/collection variants using existing identity, cosmetics and stats. Arena authenticates current-character reads, retains known artwork on transient failure, puts actionable rounds before hero, keeps quests/streaks/standings/rivals/offers, and has Customize/Cosmetics actions without a second main Battle button. Profile shares the card, preserves account destinations and sharing. Shop uses two columns only at viewport>=390 and fontScale<=1.15; otherwise one. Cards scroll, contain actual current fighter art, show rarity/prices/owned/equipped/earned alternative, and have Preview only; Buy/Equip/Remove stay in preview footer with purchase confirmation. Keep categories/loadout/filter/recovery behavior.

## Task 3: Complete battle presentation

Migrate prompt-entry, matchmaking, waiting, round-result, result and create mode screen plus BattleModeSheet, ModeCard, VersusStrip, HPBar, SeriesScoreIndicator, FaceOffPortraits/FighterEntrance, move components, RoundResultCinematic and components/reveal. Use shared native components, compact matchup/theme/deadline, same stable identity and readable HP. Keep all writing modes, suggestion allowance and paid reroll prices, safety actions, drafts and submit outcomes. Collapsing keyboard presentation must keep focused editor/caret and footer reachable with one inset owner. Preserve hold-to-submit and confirmation alternative. Mode picker retains modes and redirects. Results lead with authoritative outcome/score/HP/explanation and pinned Continue or Battle Again/Arena. Preserve optional media, retry, appeals, revised verdict and sharing behavior. Frame and move effects respect blur/background/reduced motion.

## Task 4: Competition, account entry and character editing

Migrate Battles, Rankings, Stats, sign-in, sign-up, reset-password, welcome, create-character, edit-character and their relevant specialized components. Preserve paginated history plus separately loaded active rows; ranked populations0–4; seasons/data windows; safety actions; native Apple sign-in; age/account guard; starter practice; creator steps, editing modes, grants, portrait recovery, allocation/respec. Reuse style family with calm forms and compact collection cards. Long names and localized content wrap. Keep all recovery and empty states truthful.

## Task 5: Utility screens and remaining overlays

Migrate Wallet, Settings, Blocked, shared sheets, confirmations, gear/archetype/item/render/portrait viewers, reports, tutorial, offers, toast, skeleton and errors. Preserve native switches/system/payment/permission presentation. Wallet keeps full-width localized rows, subscription copy, restoring and pending references. Overlays preserve bounded body scrolling, pinned actions, close/back/dismiss rules and accessibility focus. At 48pt minimum all actions remain reachable. Use full inventory to find remaining old visual chrome.

## Task 6: Branding, share, verification and release

Bundle licensed Barlow Condensed Bold and ExtraBold Italic. Add transparent wordmark and crossed-quill branding, update splash and new share cards; keep app icon/video branding. Font errors never strand startup. Synchronize existing checked-in iOS and generated Android configuration without overwriting audio/native customizations. Verify reviewed outcomes in share cards. Update design language, relevant concept entries and acceptance documentation, including new font policy. Default version1.3.0, next remote EAS build number.

Run focused tests during waves, then full Jest/TypeScript/ESLint. Add tests for responsive collections, accessible primitives, font fallback, identity/frame dimensions; preserve draft/nav/tutorial/history/leaderboard/wallet/cosmetic/media/appeal coverage. Native acceptance covers all screen/states on iOS and Android including small phone, accessibility text, keyboard, VoiceOver/TalkBack and Reduced Motion; compare typing/scroll/transition/memory with baseline. Ship completed client to TestFlight and Android internal only after acceptance. Record any missing native capability explicitly and do not claim unperformed acceptance. No server rollback or dual production visual system.
