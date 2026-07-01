/**
 * Design system spacing constants
 * Based on 8pt grid system
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Typography scale
 *
 * `xs`–`xxxl` are the everyday utility sizes. `display`/`hero`/`mega` are the
 * signature sizes reserved for identity + battle/reveal moments.
 */
export const Typography = {
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    // Hero / display sizes for identity + cinematic reveal surfaces.
    display: 40,
    hero: 48,
    mega: 56,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

/**
 * Standardized numeric rendering. Apply to any Text that shows scores, HP,
 * credits, timers, or damage so digits use fixed-width glyphs and do not jitter
 * while counting/animating.
 */
export const NumericFontVariant: TextStyle = {
  fontVariant: ['tabular-nums'],
};

/**
 * Border radius
 */
export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

/**
 * Common layout dimensions
 */
export const Layout = {
  tabBarHeight: 60,
  headerHeight: 56,
  buttonHeight: 48,
  inputHeight: 44,
} as const;

/**
 * Elevation / shadow tokens. Cross-platform (iOS shadow + Android elevation).
 * Use these instead of hand-rolling shadow props so depth stays consistent.
 */
export const Elevation: Record<'none' | 'sm' | 'md' | 'lg' | 'xl', ViewStyle> = {
  none: {},
  sm: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 2 },
    default: {},
  })!,
  md: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 6 },
    default: {},
  })!,
  lg: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.26,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
    },
    android: { elevation: 12 },
    default: {},
  })!,
  xl: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.34,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 18 },
    },
    android: { elevation: 20 },
    default: {},
  })!,
};

/**
 * Motion tokens. Durations are milliseconds. `easing` values are cubic-bezier
 * control points consumable by both RN's `Easing.bezier(...)` and Reanimated's
 * `Easing.bezier(...)`. `spring` is a shared spring config.
 */
export const Motion = {
  durations: {
    fast: 150,
    base: 250,
    slow: 400,
    reveal: 600,
    count: 900,
  },
  easing: {
    // Decelerate — good for entrances (ease-out).
    decelerate: [0.16, 1, 0.3, 1] as [number, number, number, number],
    // Standard — general purpose.
    standard: [0.2, 0, 0, 1] as [number, number, number, number],
  },
  spring: {
    damping: 15,
    stiffness: 140,
    mass: 1,
  },
} as const;

/**
 * The single signature gradient definition for the app.
 *
 * `brand` is the two-stop identity gradient. `poster` builds a cinematic,
 * vertical (top→bottom) reveal gradient from a signature/winner color that
 * fades toward near-black at the bottom — this guarantees WCAG-AA contrast for
 * white overlay text placed low in the poster while keeping the winner's color
 * dominant up top. Returns SVG stop descriptors.
 */
export interface GradientStop {
  color: string;
  offset: string;
  opacity: number;
}

export const Gradients = {
  brand: ['#7C3AED', '#EC4899'] as [string, string],
  poster: (base: string): GradientStop[] => [
    { color: base, offset: '0%', opacity: 0.95 },
    { color: base, offset: '42%', opacity: 0.5 },
    { color: '#0B0B0F', offset: '100%', opacity: 0.96 },
  ],
} as const;
