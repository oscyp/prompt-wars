import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted app theme preference ("Cinematic Arena" standard — see
 * docs/DESIGN_LANGUAGE.md).
 *
 * The game's identity is dark-first: the default is `dark` rather than
 * following the OS, because the battle spine (face-off, reveal poster,
 * archetype art) is designed on near-black. Light stays fully supported —
 * users can pick `light` or `system` in Settings → Appearance.
 *
 * Mirrors the module-flag + AsyncStorage pattern of utils/soundSettings.ts /
 * utils/accessibilitySettings.ts: synchronous reads for non-React consumers,
 * a subscriber registry for live updates, and a hydrate call on app start.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

const STORAGE_KEY = 'pw:settings:theme';

let preference: ThemePreference = DEFAULT_THEME_PREFERENCE;

type Listener = (preference: ThemePreference) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(preference);
    } catch {
      // A misbehaving subscriber must never break preference propagation.
    }
  }
}

/** Synchronous read of the current theme preference (safe default). */
export function getThemePreference(): ThemePreference {
  return preference;
}

/**
 * Subscribe to preference changes. Returns an unsubscribe function.
 * Compatible with `useSyncExternalStore` in `useThemedColors`.
 */
export function subscribeThemePreference(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Update the preference in memory, notify subscribers, and persist it. */
export function setThemePreference(value: ThemePreference): void {
  preference = value;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
}

/**
 * Hydrate the in-memory preference from storage. Returns the resolved value.
 * Never throws; on any storage error or unknown value the default is kept.
 */
export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'system' || raw === 'light' || raw === 'dark') {
      preference = raw;
      emit();
    }
  } catch {
    // Keep the current value on any storage failure.
  }
  return preference;
}
