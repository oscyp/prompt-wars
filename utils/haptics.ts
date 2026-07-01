import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Centralized haptic feedback helper.
 *
 * - No-ops gracefully on platforms without a haptics engine (web, unsupported
 *   devices) and never throws.
 * - Respects a global mute flag so a settings toggle can disable all haptics
 *   via `setHapticsEnabled(false)`.
 *
 * Keep haptics semantic (victory / defeat / hp loss / selection) rather than
 * calling the raw Expo API at each site, so the feel stays consistent.
 */
let hapticsEnabled = true;

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

export function areHapticsEnabled(): boolean {
  return hapticsEnabled;
}

function canFire(): boolean {
  return hapticsEnabled && supported;
}

/** Light "tick" for selection changes (move type, prompt pick, toggles). */
export function hapticSelection(): void {
  if (!canFire()) return;
  Haptics.selectionAsync().catch(() => {});
}

/** Physical impact — use for HP loss / hits. */
export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
): void {
  if (!canFire()) return;
  Haptics.impactAsync(style).catch(() => {});
}

export function hapticSuccess(): void {
  if (!canFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => {},
  );
}

export function hapticWarning(): void {
  if (!canFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    () => {},
  );
}

export function hapticError(): void {
  if (!canFire()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}

// --- Semantic battle helpers -------------------------------------------------

/** Victory outcome. */
export function hapticVictory(): void {
  hapticSuccess();
}

/** Defeat outcome. */
export function hapticDefeat(): void {
  hapticError();
}

/** Draw outcome. */
export function hapticDraw(): void {
  hapticWarning();
}

/** The player took damage / lost HP. */
export function hapticHpLoss(): void {
  hapticImpact(Haptics.ImpactFeedbackStyle.Heavy);
}
