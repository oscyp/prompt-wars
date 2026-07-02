import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted accessibility preferences (concept doc §22a).
 *
 * Mirrors the module-flag + AsyncStorage pattern of utils/soundSettings.ts so
 * non-React consumers (e.g. the shared `useReducedMotion` hook) can read the
 * current value synchronously, while React components can subscribe for live
 * updates when the user flips a toggle in Settings.
 *
 * Previously the Settings screen held these as plain `useState` values that
 * were never persisted and never read anywhere — the toggles did nothing. This
 * module makes them survive restarts and gives `reducedMotion` real teeth by
 * OR-ing it with the OS "Reduce Motion" setting inside `useReducedMotion`.
 */
export interface AccessibilityPreferences {
  /** Manual "Reduce Motion" override; OR-ed with the OS setting. */
  reducedMotion: boolean;
  /** Prefer a dyslexia-friendly typeface where supported. */
  dyslexiaFont: boolean;
  /** Prefer higher-contrast theming where supported. */
  highContrast: boolean;
  /** Allow OS font scaling (Dynamic Type). */
  dynamicType: boolean;
}

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  reducedMotion: false,
  dyslexiaFont: false,
  highContrast: false,
  dynamicType: true,
};

const STORAGE_KEY = 'pw:settings:accessibility';

let prefs: AccessibilityPreferences = { ...DEFAULT_ACCESSIBILITY_PREFERENCES };

type Listener = (prefs: AccessibilityPreferences) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(prefs);
    } catch {
      // A misbehaving subscriber must never break preference propagation.
    }
  }
}

/** Synchronous read of all current preferences (safe defaults). */
export function getAccessibilityPreferences(): AccessibilityPreferences {
  return prefs;
}

/** Synchronous read of the manual "Reduce Motion" override. */
export function isReducedMotionForced(): boolean {
  return prefs.reducedMotion;
}

/**
 * Subscribe to preference changes. Returns an unsubscribe function.
 * Used by `useReducedMotion` so animations react the instant the toggle flips.
 */
export function subscribeAccessibility(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Update one preference in memory, notify subscribers, and persist it. */
export function setAccessibilityPreference<
  K extends keyof AccessibilityPreferences,
>(key: K, value: AccessibilityPreferences[K]): void {
  prefs = { ...prefs, [key]: value };
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
}

/**
 * Hydrate the in-memory preferences from storage. Returns the resolved value.
 * Never throws; on any storage/parse error the current defaults are kept.
 */
export async function loadAccessibilityPreferences(): Promise<AccessibilityPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>;
      prefs = { ...DEFAULT_ACCESSIBILITY_PREFERENCES, ...parsed };
      emit();
    }
  } catch {
    // Keep the current value on any storage/parse failure.
  }
  return prefs;
}
