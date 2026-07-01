import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Global "Sound & Music" (SFX) preference for the Tier 0 reveal audio.
 *
 * Mirrors the in-memory module-flag pattern of utils/haptics.ts so any code path
 * — including the non-React reveal audio controller — can read the current value
 * synchronously via `isSoundEnabled()`. It additionally persists the choice in
 * AsyncStorage (already a project dependency) so it survives app restarts.
 *
 * Default is ON. Call `loadSoundEnabled()` once at startup to hydrate the flag
 * from storage before the first reveal; `setSoundEnabled()` updates both the
 * in-memory flag and storage.
 */
const STORAGE_KEY = 'pw:settings:sound_enabled';

let soundEnabled = true;

/** Synchronous read of the current preference (safe default: ON). */
export function isSoundEnabled(): boolean {
  return soundEnabled;
}

/** Update the preference in memory and persist it (fire-and-forget, never throws). */
export function setSoundEnabled(enabled: boolean): void {
  soundEnabled = enabled;
  AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0').catch(() => {});
}

/**
 * Hydrate the in-memory flag from storage. Returns the resolved value. Never
 * throws; on any storage error the current (default ON) value is kept.
 */
export async function loadSoundEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    if (v === '0') soundEnabled = false;
    else if (v === '1') soundEnabled = true;
  } catch {
    // Keep the current value on any storage failure.
  }
  return soundEnabled;
}
