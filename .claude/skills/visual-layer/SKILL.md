---
name: visual-layer
description: Use when authoring or modifying anything visible in the Prompt Wars Expo app — screens, components, styling, theming (light/dark), animations, layouts, typography, colors, icons, or accessibility. Trigger on tasks like "build a screen", "style this", "add a button", "make it look like…", "fix the dark mode", "add an animation", "match the design", or any change under app/, components/, styles/, constants/Colors.ts, constants/DesignTokens.ts. Encodes the project's design tokens, theming pattern, archetype color system, and a11y conventions so visual work stays consistent.
---

# Visual Layer — Prompt Wars

This skill is the source of truth for how the UI is built in this Expo / React Native app. Read it before writing any code that renders pixels.

## Stack you're working with

- **Expo SDK 55**, **React Native 0.83.6**, **React 19.2**
- **Expo Router** for navigation (file-based: `app/`)
- **react-native-reanimated 4** + **react-native-worklets** for animations
- **react-native-svg** (+ `react-native-svg-transformer` so `.svg` files can be imported as components)
- **@expo/vector-icons** for icon glyphs
- **expo-haptics** for tactile feedback
- **react-native-safe-area-context** (already wrapped at the root) — use `useSafeAreaInsets()` not hard-coded padding for notches/home indicators
- **react-native-gesture-handler** root is mounted in [app/_layout.tsx](../../../app/_layout.tsx) — any gesture-driven UI must use it, not the legacy RN gesture system
- No StyleSheet preprocessor, no Tamagui/NativeWind. Plain `StyleSheet.create` + design tokens.

## The design system — non-negotiable

All visual values come from two files. **Do not hard-code spacing, font sizes, radii, or colors anywhere else.**

- [constants/DesignTokens.ts](../../../constants/DesignTokens.ts) — `Spacing` (8pt grid: xs/sm/md/lg/xl/xxl), `Typography` (`sizes`, `weights`), `BorderRadius`, `Layout` (tabBarHeight, headerHeight, buttonHeight, inputHeight)
- [constants/Colors.ts](../../../constants/Colors.ts) — `Colors.light` / `Colors.dark` palettes and `ArchetypeColors`

Rules:

1. Import tokens, don't redefine. `import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens'`.
2. Never write a color hex outside `constants/Colors.ts` or `constants/Archetypes.ts`. If you need a new color, add it to the palette — and add the matching value to both `light` and `dark`.
3. Spacing is always a token. `padding: 13` is a bug; use `Spacing.md`.
4. Font sizes are always `Typography.sizes.*`; weights are always `Typography.weights.*` (note these are typed string literals like `'600' as const`, not numbers).
5. Use the `@/` path alias (configured in [tsconfig.json](../../../tsconfig.json)) for all internal imports — never relative `../../`.

## Theming — light/dark

Color access goes through the hook, never direct palette access:

```tsx
import { useThemedColors } from '@/hooks/useThemedColors';

const colors = useThemedColors();
// then: colors.background, colors.text, colors.primary, colors.attack, etc.
```

[hooks/useThemedColors.ts](../../../hooks/useThemedColors.ts) reads `useColorScheme()` and returns the right palette. **Every component must work in both modes** — verify by reading `colors.*` for every color you use rather than embedding values in `StyleSheet.create`.

Pattern: keep structural styles in `StyleSheet.create` (sizes, layout, radii); inject themed colors inline via the `style={[styles.x, { backgroundColor: colors.card }]}` pattern. See [components/Button.tsx](../../../components/Button.tsx) for the canonical example.

`StatusBar` style is set in the root layout based on color scheme — don't override per-screen unless you really mean it.

## Archetype colors

[constants/Archetypes.ts](../../../constants/Archetypes.ts) defines the 5 character archetypes (strategist/trickster/titan/mystic/engineer), each with a signature `color`. When rendering anything tied to a character — avatar borders, badges, banners, win states — pull `ARCHETYPES[id].color` rather than picking a palette color. These colors are intentionally identical across light/dark because they are brand identity, not UI chrome.

Battle-action colors (`colors.attack`, `colors.defense`, `colors.finisher`) live in the themed palette and *do* shift between modes.

## Component conventions

Look at [components/Button.tsx](../../../components/Button.tsx) — it's the reference implementation. New shared components should follow the same shape:

- Props interface extends the underlying RN component's props (e.g. `TouchableOpacityProps`) so consumers keep ergonomics.
- `variant` prop for visual modes (`primary | secondary | danger`) — switch on it for colors, never duplicate the component.
- `loading` state shows `ActivityIndicator` with the same color as the text would have been.
- `disabled || loading` collapses background to `colors.border`.
- Always set `accessibilityRole`, `accessibilityLabel`, and `accessibilityState` for interactive elements.
- Layout uses tokens (`height: 48` is fine because it equals `Layout.buttonHeight`; prefer the token).
- Export via [components/index.ts](../../../components/index.ts) barrel.

When you'd be tempted to fork the component for a one-off look: add a variant prop instead.

## Styles directory — caveat

There are currently **two files both exporting `commonStyles`**: [styles/common.ts](../../../styles/common.ts) and [styles/commonStyles.ts](../../../styles/commonStyles.ts). The newer one (`commonStyles.ts`) is the one to import from. If you touch this area, flag the duplication to the user — they almost certainly want one removed — but don't silently delete it without confirmation.

## Accessibility — required, not optional

Every interactive node gets:

- `accessibilityRole` (`button` | `link` | `header` | `image` | `text` …)
- `accessibilityLabel` — human-readable, not the icon name
- `accessibilityState` for things that have on/off/disabled/selected
- `accessibilityHint` only when the label alone is ambiguous

Tabs in [app/(tabs)/_layout.tsx](../../../app/(tabs)/_layout.tsx) already set `tabBarAccessibilityLabel` — match that pattern for any new tab.

Dynamic type: text should not have fixed heights that clip when the user scales fonts. `styles/common.ts` exports a `getDynamicFontSize` helper if you need to scale manually, but prefer letting the OS scale `Typography.sizes.*` naturally — only avoid that if you have a specific reason (e.g. fitting a fixed badge).

Hit targets: minimum 44×44pt for tappables. `Layout.buttonHeight` (48) and `Layout.inputHeight` (44) already meet this.

## Layout primitives

- Use `commonStyles.container` / `centerContent` / `row` / `spaceBetween` for the obvious patterns rather than re-deriving.
- `SafeAreaView` from `react-native-safe-area-context`, not the deprecated RN one, for the top of any screen that owns the status bar. Most screens inside `(tabs)` and `(battle)` route groups should rely on the Stack/Tabs chrome and not double-pad.
- Shadows: use `commonStyles.shadowLight` / `shadowMedium`. iOS gets `shadow*` props, Android gets `elevation` — both are set together.
- Borders: `colors.border` (strong) vs `colors.borderLight` (subtle).

## Animations

- Default to Reanimated 4 with worklets. Keep animations on the UI thread (`useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`).
- Match RN's standard easing where you can; for branded "punchy" feedback (battle reveals, damage flashes), springs feel right.
- Pair tactile moments with `expo-haptics` (e.g. `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` on attack reveal) — but never on every tap; reserve for moments that matter.
- Respect `AccessibilityInfo.isReduceMotionEnabled()` for anything beyond simple fades.

## Icons & images

- `@expo/vector-icons` for UI glyphs (Ionicons, MaterialCommunityIcons, etc.) — pick one family per surface for consistency.
- `.svg` files imported as components thanks to `react-native-svg-transformer` (see [metro.config.js](../../../metro.config.js)). Prefer SVG over PNG for any flat illustration so it scales and themes cleanly.
- Tint SVGs with `colors.*` props rather than embedding fills in the file.
- Raster assets live under [assets/images/](../../../assets/images/).

## Mobile-first

This is a phone-first app. Don't introduce wide breakpoints, hover states, or web-only APIs without an explicit reason. Test landscape + small-screen + dynamic-type-XL whenever a layout could conceivably break.

## Before you finish a visual change

Walk through this mental checklist:

1. Every color comes from `useThemedColors()` or `ARCHETYPES[id].color`?
2. Every spacing/font/radius uses a token?
3. Works in dark mode (re-read the file looking for hard-coded `#fff`/`#000`/RGB)?
4. Interactive elements have `accessibilityRole` + `accessibilityLabel`?
5. Hit targets ≥ 44pt?
6. No imports from `styles/common.ts` (use `styles/commonStyles.ts`)?
7. Uses `@/` alias, not relative `../`?
8. If you added a new shared component: exported via [components/index.ts](../../../components/index.ts)?

If any answer is "no" without a written reason, fix it before reporting the task done.
