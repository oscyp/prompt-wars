import { useSyncExternalStore } from 'react';
import type { TextStyle } from 'react-native';
import {
  getAccessibilityPreferences,
  subscribeAccessibility,
} from '@/utils/accessibilitySettings';

/**
 * Reactively read the persisted "Dyslexia-Friendly Font" preference (Settings →
 * Accessibility). Mirrors `useHighContrast` in `useThemedColors` — the snapshot
 * re-runs whenever any accessibility toggle flips.
 */
export function useDyslexiaFont(): boolean {
  return useSyncExternalStore(
    subscribeAccessibility,
    () => getAccessibilityPreferences().dyslexiaFont,
    () => getAccessibilityPreferences().dyslexiaFont,
  );
}

/**
 * Text-style delta applied to primary reading/writing surfaces when the
 * dyslexia-friendly preference is on. We don't ship a custom OpenDyslexic
 * typeface (heavy binary asset); instead we widen letter spacing, which is the
 * layout-safe lever with the strongest evidence base for readability, and is
 * consumed by `useAccessibleTextStyle`.
 */
export const DYSLEXIA_TEXT_STYLE: TextStyle = {
  letterSpacing: 0.6,
};

/**
 * Returns a spreadable `TextStyle` (empty when the toggle is off) for reading
 * surfaces to merge into their text styles, e.g.
 * `style={[styles.body, accessibleText]}`. Keeps consumers a one-liner and lets
 * the toggle produce a visible effect wherever it's wired.
 */
export function useAccessibleTextStyle(): TextStyle {
  const dyslexiaFont = useDyslexiaFont();
  return dyslexiaFont ? DYSLEXIA_TEXT_STYLE : {};
}
