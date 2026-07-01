import React, { createContext, useContext } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors, ColorStyle } from '@/constants/Colors';

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
 * Hook to get current theme colors.
 *
 * Uses a forced scheme when one is provided by an ancestor
 * `ForcedColorSchemeProvider`; otherwise automatically switches between light
 * and dark mode based on the system setting.
 */
export function useThemedColors() {
  const forced = useContext(ForcedColorSchemeContext);
  const colorScheme = useRNColorScheme() ?? 'light';
  const scheme: ColorStyle = forced ?? (colorScheme as ColorStyle);
  return Colors[scheme];
}
