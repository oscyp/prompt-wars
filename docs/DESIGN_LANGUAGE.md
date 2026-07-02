# Prompt Wars — Design Language: "Cinematic Arena"

_The visual standard for the mobile app. Decided in `UX_DESIGN_REVIEW.md` (2026-07);
derived from the strongest existing surfaces — the Tier 0 reveal poster and the
generated archetype illustrations. The concept doc (`docs/prompt-wars-implementation-concept.md`)
stays the source of truth for scope; this doc governs how things look and move._

## Principles

1. **Dark-first.** The default theme is dark (`utils/themeSettings.ts`,
   `DEFAULT_THEME_PREFERENCE = 'dark'`). The game's identity — archetype art, reveal
   posters, signature-color glows — is designed on near-black. Light theme remains fully
   supported via Settings → Appearance (Dark / Light / System); never hardcode one
   scheme outside designated cinematic surfaces.
2. **Hero zones vs. content zones.** Illustration belongs in *hero zones*: Welcome,
   the Home daily-theme poster, matchmaking/waiting backdrops, battle-mode cards, the
   reveal poster, shop/FTUO cards, empty states. *Content zones* — lists, forms,
   settings — stay calm: solid token surfaces, no imagery behind text. Never place a
   full-screen illustration behind scrollable list/form content.
3. **AA on imagery, always.** Any text over an illustration sits on a scrim:
   `Gradients.poster(base)` for vertical posters, or a flat `rgba(11,11,15,0.3–0.55)`
   overlay / dark pill for labels. If you can't guarantee contrast, add the pill.
4. **Signature color is the player's, brand gradient is the game's.** Player identity
   moments use the character's signature color (borders, HP bars, poster base). The
   brand gradient (`Gradients.brand`, `#7C3AED → #EC4899`) is reserved for game-level
   identity: the raised Battle button, brand marks, FTUO. Don't spend it on ordinary
   chrome.
5. **No emoji in UI chrome.** Utility marks are Ionicons/MaterialCommunityIcons;
   identity moments get bundled generated illustrations. Emoji remain fine inside
   user-generated content (prompts, battle cries). `ART_STYLE_GLYPHS` exists only as a
   code-level fallback and must never be the shipped visual.
6. **Generated art is bundled, never runtime.** UI illustrations are produced once by
   `node scripts/generate-assets.mjs --only ui` (Gemini image API, brand-palette prompt
   template in the script), post-processed with sharp, committed under
   `assets/images/ui/`, and registered in `constants/UiArt.ts`. The app must never
   depend on an image-generation call at runtime (provider failures never block).
7. **Tokens only.** Spacing, type, radius, elevation, motion come from
   `constants/DesignTokens.ts`; colors (including `medalGold/Silver/Bronze`) from
   `constants/Colors.ts` via `useThemedColors`. No hardcoded hex in screens except the
   fixed-dark cinematic surfaces (`#0B0B0F` scrims, white-on-scrim text).
8. **A character is never an initial.** Any player representation uses a portrait or a
   bundled archetype illustration (`getArchetypeAvatar`); other players' characters are
   RLS-protected, so lists use the neutral default illustration.

## Navigation

- **4 tabs + the verb.** Arena (home) · Battles · **[raised Battle button]** ·
  Rankings · Profile. The raised center button is the game's verb: it opens the
  battle-mode bottom sheet (`components/BattleModeSheet.tsx`), it never navigates.
- The `(tabs)/create` route stays as the deep-link/notification fallback and renders
  the same `ModeCard`s full-screen. Keep the sheet and the screen in sync through
  `constants/BattleModes.ts` — one source of truth.
- Screens inside the shell open the sheet via `useBattleSheet()`.

## Motion & accessibility

- Every animation respects Reduce Motion (`useReducedMotion()` — OS setting OR-ed with
  the in-app toggle). Durations/easings come from `Motion` tokens.
- Interactive targets ≥ 44pt; every actionable element has `accessibilityRole` and a
  meaningful `accessibilityLabel`; numeric counters use `NumericFontVariant`.
- Move-type indicators encode shape + color, never color alone (§22a).

## AI-content disclosure (store-critical, concept §22)

- The reveal poster (`RoundResultCinematic`) always carries the `AI-GENERATED` pill.
- The shareable scorecard region in `(battle)/result.tsx` bakes in the
  "AI-generated content — Prompt Wars" footer so exported images carry the label.
- Tier 1 videos: the server-side watermark must carry the same tag (backend).

## Asset recipe (for future batches)

- Prompt template: `BRAND` constant in `scripts/generate-assets.mjs` (near-black bg,
  electric purple `#8B5CF6`, magenta `#D946EF`, cyan `#22D3EE`, esports-cinematic,
  `NO_TEXT` guard). Explicitly demand "background fills the entire canvas edge-to-edge,
  no border/frame" for emblem tiles — the model likes to invent white mats.
- Tiles 512×512 JPEG q85; full-bleed backdrops 1080-wide JPEG. JPEG, not WebP (iOS
  core `<Image>` can't decode WebP).
- After generating: eyeball every asset (framing, palette drift), then register it in
  `constants/UiArt.ts` and note its zone here.
