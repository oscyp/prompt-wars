import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors, ColorStyle } from '@/constants/Colors';
import {
  getThemePreference,
  subscribeThemePreference,
} from '@/utils/themeSettings';
import {
  getAccessibilityPreferences,
  subscribeAccessibility,
} from '@/utils/accessibilitySettings';

/** Widened palette shape shared by the standard and high-contrast variants. */
export type ThemeColors = { [K in keyof typeof Colors.light]: string };

/**
 * High-contrast palette variants (Settings → Accessibility → High Contrast
 * Mode, concept §22a). Same shape as `Colors`, with text/background contrast
 * pushed toward pure black/white, stronger borders, and darker (light) /
 * lighter (dark) accents so every accent color meets WCAG AA against its
 * background. Centralized here — `useThemedColors` is the single point where
 * theme colors are resolved, so every screen picks this up automatically.
 */
export const HighContrastColors: Record<ColorStyle, ThemeColors> = {
  light: {
    ...Colors.light,
    primary: '#5B21B6',
    primaryDark: '#4C1D95',
    primaryLight: '#6D28D9',
    background: '#FFFFFF',
    backgroundSecondary: '#FFFFFF',
    backgroundTertiary: '#E5E7EB',
    text: '#000000',
    textSecondary: '#1F2937',
    textTertiary: '#374151',
    border: '#111827',
    borderLight: '#4B5563',
    card: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.3)',
    success: '#047857',
    warning: '#92400E',
    error: '#B91C1C',
    info: '#1D4ED8',
    attack: '#B91C1C',
    defense: '#1D4ED8',
    // Finisher must never equal primary (see constants/Colors.ts).
    finisher: '#9D174D',
    link: '#1D4ED8',
    tabIconDefault: '#374151',
    tabIconSelected: '#5B21B6',
  },
  dark: {
    ...Colors.dark,
    primary: '#C4B5FD',
    primaryDark: '#A78BFA',
    primaryLight: '#DDD6FE',
    background: '#000000',
    backgroundSecondary: '#0A0A0A',
    backgroundTertiary: '#1F2937',
    text: '#FFFFFF',
    textSecondary: '#F3F4F6',
    textTertiary: '#D1D5DB',
    border: '#9CA3AF',
    borderLight: '#6B7280',
    card: '#0A0A0A',
    shadow: 'rgba(0, 0, 0, 0.6)',
    success: '#6EE7B7',
    warning: '#FCD34D',
    error: '#FCA5A5',
    info: '#93C5FD',
    attack: '#FCA5A5',
    defense: '#93C5FD',
    // Finisher must never equal primary (see constants/Colors.ts).
    finisher: '#F9A8D4',
    link: '#93C5FD',
    tabIconDefault: '#D1D5DB',
    tabIconSelected: '#C4B5FD',
  },
};

/**
 * Allows a subtree (e.g. the cinematic `(battle)` group) to force a specific
 * color scheme regardless of the OS light/dark setting. `null` means "follow
 * the system", which is the default everywhere else.
 */
export const ForcedColorSchemeContext = createContext<ColorStyle | null>(null);

export interface ForcedColorSchemeProviderProps {
  scheme: ColorStyle;
  children: React.ReactNode;
}

/** Forces `scheme` for all descendants that read `useThemedColors`. */
export function ForcedColorSchemeProvider({
  scheme,
  children,
}: ForcedColorSchemeProviderProps) {
  return React.createElement(
    ForcedColorSchemeContext.Provider,
    { value: scheme },
    children,
  );
}

/**
 * Resolve the effective color scheme ("Cinematic Arena" is dark-first):
 * 1. a forced scheme from an ancestor `ForcedColorSchemeProvider` wins,
 * 2. then the persisted Settings → Appearance preference (default `dark`),
 * 3. `system` preference follows the OS, falling back to dark.
 */
export function useEffectiveColorScheme(): ColorStyle {
  const forced = useContext(ForcedColorSchemeContext);
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getThemePreference,
  );
  const system = useRNColorScheme();
  if (forced) return forced;
  if (preference === 'system') return (system ?? 'dark') as ColorStyle;
  return preference;
}

/**
 * Reactively read the persisted "High Contrast Mode" preference (Settings →
 * Accessibility). `subscribeAccessibility` re-runs the snapshot whenever any
 * accessibility toggle flips, so screens re-render the instant it changes.
 */
function useHighContrast(): boolean {
  return useSyncExternalStore(
    subscribeAccessibility,
    () => getAccessibilityPreferences().highContrast,
    () => getAccessibilityPreferences().highContrast,
  );
}

/**
 * Hook to get current theme colors for the effective scheme. Returns the
 * high-contrast palette variant when the user has enabled High Contrast Mode.
 * This is the single point where theme colors are resolved, so wiring it here
 * makes the toggle take effect app-wide (every screen reads through this hook).
 */
export function useThemedColors(): ThemeColors {
  const scheme = useEffectiveColorScheme();
  const highContrast = useHighContrast();
  return highContrast ? HighContrastColors[scheme] : Colors[scheme];
}
