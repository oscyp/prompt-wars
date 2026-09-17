import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { AppState } from 'react-native';
import { presentationForTheme } from '@/constants/ThemeArt';
import { useAudioPreferences } from '@/utils/audioSettings';
import type { ArenaSoundEvent } from '@/types/arena';

type ExpoAudioApi = typeof import('expo-audio');

// A JavaScript update can reach a development client that predates expo-audio.
// Avoid evaluating expo-audio in that binary because its module-level native
// lookup throws before React can render. Audio becomes available after the
// native client is rebuilt; battles remain usable in the meantime.
function loadExpoAudio(): ExpoAudioApi | null {
  if (!requireOptionalNativeModule('ExpoAudio')) return null;

  // The conditional CommonJS load is intentional: a static import evaluates
  // expo-audio before we can detect an older native binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-audio') as ExpoAudioApi;
}

const expoAudio = loadExpoAudio();

interface BattleAudioContextValue {
  activateTheme: (theme: string) => void;
  deactivateTheme: (theme: string) => void;
  playSound: (event: ArenaSoundEvent) => void;
  stopMusic: () => void;
}

const NOOP_BATTLE_AUDIO: BattleAudioContextValue = {
  activateTheme: () => {},
  deactivateTheme: () => {},
  playSound: () => {},
  stopMusic: () => {},
};

const BattleAudioContext =
  createContext<BattleAudioContextValue>(NOOP_BATTLE_AUDIO);

const SOUND_SOURCES: Record<ArenaSoundEvent, number> = {
  matchFound: require('../assets/audio/battle/match-found.wav'),
  moveSelected: require('../assets/audio/battle/move-select.wav'),
  promptLocked: require('../assets/audio/battle/prompt-lock.wav'),
  transition: require('../assets/audio/battle/transition.wav'),
};

export function BattleAudioProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!expoAudio) {
    return (
      <BattleAudioContext.Provider value={NOOP_BATTLE_AUDIO}>
        {children}
      </BattleAudioContext.Provider>
    );
  }

  return <NativeBattleAudioProvider>{children}</NativeBattleAudioProvider>;
}

function NativeBattleAudioProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setAudioModeAsync, useAudioPlayer } = expoAudio!;
  const preferences = useAudioPreferences();
  const music = useAudioPlayer(null, { updateInterval: 1000 });
  const matchFound = useAudioPlayer(SOUND_SOURCES.matchFound);
  const moveSelected = useAudioPlayer(SOUND_SOURCES.moveSelected);
  const promptLocked = useAudioPlayer(SOUND_SOURCES.promptLocked);
  const transition = useAudioPlayer(SOUND_SOURCES.transition);
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const activeThemeRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // `useAudioPlayer` releases its native SharedObjects in passive-effect
  // cleanup. Mark the controller inactive during layout cleanup so callbacks
  // retained by child route effects cannot touch an already-released player
  // while the battle layout is unmounting.
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeThemeRef.current = null;
    };
  }, []);

  useEffect(() => {
    // iOS does not allow duckOthers while respecting the hardware silent
    // switch. Keep battle audio silent-switch-aware and mix with other audio.
    void setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch((error) => {
      console.warn('Unable to configure battle audio mode:', error);
    });
  }, [setAudioModeAsync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    music.pause();
    if (!activeTheme) return;
    music.replace(presentationForTheme(activeTheme).ambientLoop);
    music.loop = true;
    music.volume = 0.2;
  }, [activeTheme, music]);

  useEffect(() => {
    if (activeTheme && preferences.music && foreground) {
      music.play();
    } else {
      music.pause();
    }
  }, [activeTheme, foreground, music, preferences.music]);

  const activateTheme = useCallback((theme: string) => {
    if (activeThemeRef.current === theme) return;
    activeThemeRef.current = theme;
    setActiveTheme(theme);
  }, []);

  const stopMusic = useCallback(() => {
    activeThemeRef.current = null;
    if (!mountedRef.current) return;
    setActiveTheme(null);
    music.pause();
  }, [music]);

  const deactivateTheme = useCallback(
    (theme: string) => {
      if (activeThemeRef.current === theme) stopMusic();
    },
    [stopMusic],
  );

  const playSound = useCallback(
    (event: ArenaSoundEvent) => {
      if (!mountedRef.current || !preferences.soundEffects || !foreground)
        return;
      const player = {
        matchFound,
        moveSelected,
        promptLocked,
        transition,
      }[event];
      void player
        .seekTo(0)
        .then(() => {
          if (mountedRef.current) player.play();
        })
        .catch((error) => {
          if (mountedRef.current)
            console.warn('Unable to play battle sound:', error);
        });
    },
    [
      foreground,
      matchFound,
      moveSelected,
      preferences.soundEffects,
      promptLocked,
      transition,
    ],
  );

  const value = useMemo(
    () => ({ activateTheme, deactivateTheme, playSound, stopMusic }),
    [activateTheme, deactivateTheme, playSound, stopMusic],
  );

  return (
    <BattleAudioContext.Provider value={value}>
      {children}
    </BattleAudioContext.Provider>
  );
}

export function useBattleAudio(theme?: string | null) {
  const audio = useContext(BattleAudioContext);
  const { activateTheme, deactivateTheme } = audio;
  useEffect(() => {
    if (!theme) return;
    activateTheme(theme);
    return () => deactivateTheme(theme);
  }, [activateTheme, deactivateTheme, theme]);
  return audio;
}
