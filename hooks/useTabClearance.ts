import { Spacing } from '@/constants/DesignTokens';

/** Diameter of the raised centre "Battle" button in the tab bar. */
export const RAISED_BATTLE_BUTTON_SIZE = 60;

/**
 * How far the raised button pokes above the tab bar's top edge and into the
 * screen above it. Mirrors the `marginTop` in `(tabs)/_layout.tsx`.
 */
export const RAISED_BATTLE_BUTTON_OVERHANG = RAISED_BATTLE_BUTTON_SIZE / 2 - 6;

/**
 * Bottom padding a tab screen's scrolling content needs so its last row is
 * not hidden under the raised Battle button.
 *
 * The tab bar is in layout flow (not `position: 'absolute'`), so the screen
 * already ends at the bar's top edge and the bar consumes the home-indicator
 * inset itself. Only the button's overhang intrudes, plus breathing room. If
 * the bar ever becomes translucent/absolute, add `Layout.tabBarHeight` and
 * `useSafeAreaInsets().bottom` here — this is the one place that decides.
 */
export function useTabClearance(): number {
  return RAISED_BATTLE_BUTTON_OVERHANG + Spacing.lg;
}
