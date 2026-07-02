import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors, ColorStyle } from '@/constants/Colors';
import {
  getThemePreference,
  subscribeThemePreference,
} from '@/utils/themeSettings';

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

/** Hook to get current theme colors for the effective scheme. */
export function useThemedColors() {
  return Colors[useEffectiveColorScheme()];
}
