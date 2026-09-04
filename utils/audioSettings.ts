import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AudioPreferences } from '@/types/arena';

const STORAGE_KEY = 'prompt-wars:audio-preferences:v1';

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  music: true,
  soundEffects: true,
};

let current: AudioPreferences = DEFAULT_AUDIO_PREFERENCES;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getAudioPreferences(): AudioPreferences {
  return current;
}

export async function loadAudioPreferences(): Promise<AudioPreferences> {
  current = DEFAULT_AUDIO_PREFERENCES;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AudioPreferences>;
      current = {
        music: parsed.music !== false,
        soundEffects: parsed.soundEffects !== false,
      };
    }
  } catch {
    current = DEFAULT_AUDIO_PREFERENCES;
  }
  emit();
  return current;
}

export function setAudioPreference(
  key: keyof AudioPreferences,
  enabled: boolean,
) {
  current = { ...current, [key]: enabled };
  try {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Preference remains live for this session if persistence is unavailable.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAudioPreferences(): AudioPreferences {
  return useSyncExternalStore(
    subscribe,
    getAudioPreferences,
    getAudioPreferences,
  );
}
