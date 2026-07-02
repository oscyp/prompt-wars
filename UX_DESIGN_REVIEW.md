# Prompt Wars — UX/UI Design Review & Change Plan

_Coordinated against `docs/prompt-wars-implementation-concept.md` (the source of truth).
Role: `.github/agents/prompt-wars-orchestrator.agent.md`, acting as a senior mobile-game
UX/UI designer (20 yrs). Domains touched: Game Design, Mobile, Safety/Accessibility, QA.
Companion to `ORCHESTRATOR_GAP_REVIEW.md` (2026-07)._

## Decision summary

The app currently speaks **two visual languages**. The battle spine (face-off → reveal)
is genuinely designed: 9:16 motion poster, signature-color gradients with guaranteed AA
contrast, Ken Burns parallax, Gemini-generated archetype illustrations, motion/elevation
tokens. The **shell around it** (Welcome, Home, Create, Rankings, Battles, Profile) is a
generic white/dark utility app — plain text titles, flat hand-rolled cards, three emoji
buttons as the main entry point to the core loop. The product vision says identity and
the reveal drive retention; today the shell actively undersells both.

**Decisions (recommendation):**

1. **Standard: "Cinematic Arena", dark-first.** One design language derived from what the
   reveal already does: near-black surfaces, signature-color accents, the brand gradient
   (`#7C3AED → #EC4899`) reserved for identity moments, generated illustration in
   *designated hero zones only*. Dark becomes the default theme (light stays supported).
2. **Keep tabs — but 4 + a raised center Battle action, not 5.** Do not replace tab
   navigation with a custom interactive hub. Kill the dead `create` tab screen; "Start
   battle" becomes a raised center button in the tab bar opening a mode bottom-sheet.
3. **Illustrations: hero zones yes, full-screen backgrounds no.** Content lists stay on
   calm solid surfaces (Dynamic Type / dyslexia font / high contrast are §22a
   commitments). Generated art goes where identity lives: daily-theme poster on Home,
   Welcome backdrop, matchmaking/waiting arena, mode cards, empty states.
4. **Emoji out of UI chrome.** Only 5 call-sites exist; replace with bundled generated
   illustrations (Gemini API / Imagen — same one-time pipeline already used for
   `assets/images/avatars/`) or existing Ionicons. Emoji remain fine inside user content.

## Implementation status (2026-07-02)

**Phases 1–2 and the client-side part of Phase 3 are implemented** in this working tree:
`docs/DESIGN_LANGUAGE.md` (the standard) · dark-first theme preference
(`utils/themeSettings.ts`, Settings → Appearance, default `dark`) · medal tokens ·
7 generated UI assets (`assets/images/ui/`, via `scripts/generate-assets.mjs --only ui`,
registered in `constants/UiArt.ts`) · all chrome emoji replaced (create ×3, matchmaking,
wallet ×2, waiting status glyphs) · tab bar 4 + raised gradient Battle button opening
`BattleModeSheet` (`create` route kept as illustrated deep-link fallback; shared
`constants/BattleModes.ts` + `ModeCard`) · Home → Arena (theme-poster hero, credits chip,
`SectionCard`, avatar rows) · Rankings medal tokens + avatars · Battles status chips +
avatars · Welcome full-bleed hero + scrim + age gate · matchmaking arena backdrop +
clash emblem · `AI-GENERATED` pill on the reveal poster + share-card footer disclosure.
Verified: `tsc` 0 errors, Jest 4/19 green (incl. new `themeSettings` suite), lint 0 errors.
Still open: on-device visual QA matrix, per-theme poster art (cost-gated), display
typeface, high-contrast/dyslexia theming, server-side video watermark tag.

## Audit — what exists (verified in code)

**Solid foundation, underused:**

- `constants/DesignTokens.ts` — 8pt spacing, type scale incl. `display/hero/mega`,
  `tabular-nums`, cross-platform `Elevation`, `Motion` tokens, brand gradient + a
  `poster()` gradient that guarantees WCAG-AA for overlay text. This is *good*.
- `constants/Colors.ts` — light/dark palettes, archetype signature colors, move-type
  colors (attack/defense/finisher).
- `constants/ArchetypeAvatars.ts` — 6 bundled Gemini-generated illustrations ("dark
  cinematic, signature-color themed"), designed so a fighter is *never* a bare initial.
  **This is the proven pipeline and the visual north star.**
- `components/RoundResultCinematic.tsx` — the Tier 0 reveal poster. Best screen in the
  app; matches concept §8.1 exactly (client-side motion poster, non-blocking).
- `components/FaceOffPortraits.tsx` — split-screen VS with stats/HP/theme pill; good
  bones, reduce-motion aware.
- `components/` — `SectionCard`, `Button`, `HPBar`, `StreakMeter`, `MoveTypeChipRow`…
  a real component library exists.
- `ART_STYLE_THUMBS` (bundled JPGs) already supersede the emoji `ART_STYLE_GLYPHS`
  (fallback-only path in `ArtStylePicker.tsx:127`).

**Gaps (ranked by damage to the product idea):**

| # | Gap | Where | Why it matters |
|---|-----|-------|----------------|
| 1 | Shell ≠ battle spine. Home/Rankings/Battles/Profile are flat utility lists; no brand gradient, no illustration, no elevation tokens, hand-rolled card styles instead of `SectionCard`/`Button` (`app/(tabs)/home.tsx` styles its own cards, hardcodes `rgba(0,0,0,0.05)` borders, raw `borderRadius: 8`). | all `(tabs)` screens | First 60 seconds of every session look like a settings app; identity moments (concept §1, §5) never reach the player outside battle. |
| 2 | **Welcome screen is the weakest screen in the app** — plain text + inline age gate, no art, no gradient (`app/(onboarding)/welcome.tsx`). | onboarding | First impression of a *game*; directly gates D0 conversion to first battle (§24 KPI: first battle < 5 min). |
| 3 | `create` tab is a dead room: 3 emoji buttons (⚔️🎯🤖, `fontSize: 48`) to make one choice (`app/(tabs)/create.tsx`). | core loop entry | The single most-tapped intent ("battle now") costs a tab slot + an extra screen; emoji render inconsistently across platforms and cheapen the brand. |
| 4 | 5-tab bar dilutes the loop; default `Tabs` chrome, no center emphasis (`app/(tabs)/_layout.tsx`). | navigation | Tab #3 should be *the verb* of the game, not a place. |
| 5 | Rankings rows: hardcoded `#FFD700/#C0C0C0/#CD7F32`, no avatars — while every player *has* a designed avatar (`app/(tabs)/rankings.tsx:60-67`). | rankings | Leaderboard is a social/identity surface (§9); today it's a text table. |
| 6 | Emoji in chrome: `create.tsx` ×3, `matchmaking.tsx:113` (⚔️ as 64px hero), `wallet.tsx:88` (`✨ Prompt Wars+`) — while `home.tsx:154` already uses `Ionicons sparkles` for the same badge. | 3 files | Inconsistent, platform-dependent rendering; trivially replaceable. |
| 7 | Matchmaking/waiting are blank spinner rooms. | battle flow | Highest-anticipation moment of the loop has zero staging (concept §4: async waits must stay engaging). |
| 8 | No "AI-generated" disclosure on reveal/share assets (carried over from `ORCHESTRATOR_GAP_REVIEW.md` #1). | reveal | Store-readiness commitment (§22); must be baked into the redesigned reveal card. |

## The three questions, answered

### Tabs vs. "more interactive components"?

**Keep tabs.** Prompt Wars is an *async, session-based* competitive game — structurally a
Chess.com/Wordle/Duolingo, not a mid-core lobby game. Players return 3–10× a day for
short sessions to check battles, claim quests, climb rankings; that demands persistent,
one-tap, thumb-reachable anchors. Tabs are also the cheapest way to honor §22a
(VoiceOver, Dynamic Type) and the concept's retention surfaces (rival panel, journal,
daily-theme leaderboard all need stable homes). A custom gestural hub would cost weeks,
hurt discoverability, and fight the OS.

What *should* change: **5 tabs → 4** (Arena · Battles · Rankings · Profile) with a
**raised center "Battle" button** (brand-gradient circle, breaks the tab bar line — the
classic game pattern) that opens a **mode bottom-sheet** (Ranked / Unranked / vs Bot,
each row an illustrated card). One tap fewer to the core verb, from anywhere, and the
dead `create` screen disappears. "Interactivity" budget goes into components *inside*
screens (poster cards, streak flame, live HP bars), not into exotic navigation.

### Illustrated backgrounds vs. simple UX?

**Both, zoned.** Full-screen illustrated backgrounds behind lists are a readability and
accessibility tax (§22a: dynamic type, dyslexia font, high-contrast variant pending) and
they age fast. But the current "simple" is really *unbranded*, which is a different
thing. The standard:

- **Hero zones (illustrated):** Welcome backdrop, Home daily-theme poster card,
  matchmaking/waiting arena backdrop, mode-select cards, shop/FTUO cards, empty states.
  Always with the existing `Gradients.poster()` scrim so text stays AA.
- **Content zones (calm):** lists, forms, settings — solid surfaces, tokens only.
- **Dark-first:** the game's identity (avatars, reveal, poster scrim `#0B0B0F`) is
  already dark-cinematic; make dark the default and design light as the variant.

### Emoji?

**Out of chrome, replaced by generated art — a one-day task.** Full inventory: 3 mode
buttons (`create.tsx`), 1 matchmaking hero (⚔️), 1 wallet badge (✨ → reuse the Ionicons
`sparkles` badge from `home.tsx`). `ART_STYLE_GLYPHS` is already a dormant fallback —
keep it as code-level fallback, never ship-visible. Generate replacements with the
**same recipe as `ArchetypeAvatars.ts`** (Gemini image API, dark cinematic background,
signature-color themed, 512–1024px, bundled + committed). **Never generate UI art at
runtime** — bundling keeps the "provider failures never block" invariant and unit
economics intact.

## Executor contributions (routing)

- **game-design-executor** — Arena (Home) hub hierarchy: daily theme → streak/quests →
  active battles → rankings teaser; mode-sheet copy; anti-P2W check on shop/FTUO cards
  (cosmetics stay cosmetic).
- **mobile-executor** — tab bar rebuild (4 + raised center, mode bottom-sheet), Home
  poster card, Welcome hero, Rankings avatar rows, refactor `(tabs)` screens onto
  `SectionCard`/`Button`/tokens, dark-first default, matchmaking/waiting staging reuse
  of `FaceOffPortraits`/poster pieces.
- **ai-video-executor** — asset generation batch (prompt template documented, one-time):
  3 mode illustrations, VS/clash mark, Welcome backdrop, arena backdrop, 3–4 empty-state
  pieces; optional Phase-3 per-theme poster stills (server-cached, cost-gated per §8.1).
- **safety-executor** — "AI-generated" label baked into reveal + `shareResultCard`
  (store-critical); age-gate stays a blocking step in the redesigned Welcome.
- **qa-executor** — visual QA matrix: light/dark × dynamic type × reduce-motion ×
  color-blind palettes; tab a11y labels; contrast checks on every image-backed surface.

## Recommended plan

**Phase 1 — Standard + de-emoji (1–2 days, pure client, low risk)**
1. Write `docs/DESIGN_LANGUAGE.md`: Cinematic Arena rules (dark-first, hero vs content
   zones, gradient/illustration usage, icon policy: Ionicons for utility, no emoji in
   chrome, AA scrim rule). Add `medal.gold/silver/bronze` and surface-tier tokens to
   `Colors.ts`; sweep hardcoded hexes/radii onto tokens.
2. Generate + bundle the Phase-1 asset batch (mode ×3, clash mark, welcome hero) via
   Gemini/Imagen using the ArchetypeAvatars recipe; document the prompt template in
   `assets/README.md`.
3. Replace the 5 emoji call-sites; wallet badge → shared `SubscriberBadge` component.

**Phase 2 — Navigation + shell (3–5 days)**
4. Tab bar: 4 tabs + raised center Battle button → mode bottom-sheet with illustrated
   cards; delete `create.tsx` screen (route redirects to sheet); update `Routes.ts` and
   any deep links.
5. Home → **Arena**: daily-theme poster card (theme text over signature gradient +
   illustration, tap → battle), streak/quests/active battles on `SectionCard`, avatars
   in battle rows.
6. Rankings: avatar + signature-color rows, medal tokens, top-3 podium header.
   Battles list: status chips in move-type colors, avatar thumbnails.
7. Welcome: full-bleed hero backdrop + brand-gradient title + age gate as explicit step.
   Matchmaking/waiting: arena backdrop + staged copy ("Scanning the arena…"), reuse
   poster scrim.

**Phase 3 — Identity polish (ongoing, gated)**
8. "AI-generated" disclosure on reveal + share card (do with #5-adjacent reveal work).
9. High-contrast palette variant + dyslexia typeface wiring (closes gap-review #5).
10. Optional: display typeface for `display/hero/mega` moments (license check first);
    per-theme generated poster stills, server-cached (§8.1 Phase 2+ note) — only after
    cost sign-off.

**Explicitly rejected:** tabless gestural hub; runtime image generation for UI;
full-screen illustrated backgrounds behind list content; replacing Ionicons wholesale
with custom icon art (cost > payoff at this stage).

## Risks and open questions

- **Art consistency** across generated assets — mitigate with one frozen prompt
  template + shared style descriptors (as `ArchetypeAvatars.ts` already does).
- **Tab restructure touches deep links** (`Routes.ts`, notification routing to
  `create`) — needs a redirect and a QA pass.
- **Dark-first default** changes App Store screenshots and may surprise existing
  testers; light theme must stay fully supported (§22a).
- **Licensing** for any display typeface (Phase 3 only).
- Open: should the mode sheet auto-suggest ranked vs bot based on player history
  (game-design call)? Should the daily-theme poster ship with a generic arena
  illustration first and per-theme art later (recommended: yes)?

## Verification checklist

- `npx tsc --noEmit` → 0 errors; `yarn test` green; `yarn lint` clean.
- On-device visual QA: light + dark, Dynamic Type at max, Reduce Motion on/off,
  color-blind simulation on move-type chips.
- Every image-backed surface passes AA via the `Gradients.poster()` scrim (spot-check
  with a contrast tool on screenshots).
- Tab bar: VoiceOver reads 4 tabs + "Start battle" center action; hit targets ≥ 44pt.
- Deep links / push routes that pointed at `(tabs)/create` resolve to the mode sheet.
- Reveal/share card shows the "AI-generated" label in both tiers.
