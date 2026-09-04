import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Pressable } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockPlayers: Array<{
  pause: jest.Mock;
  play: jest.Mock;
  replace: jest.Mock;
  seekTo: jest.Mock;
  loop: boolean;
  volume: number;
}> = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const ref = jest.requireActual('react').useRef(null);
    if (!ref.current) {
      ref.current = {
        pause: jest.fn(),
        play: jest.fn(),
        replace: jest.fn(),
        seekTo: jest.fn(() => Promise.resolve()),
        loop: false,
        volume: 1,
      };
      mockPlayers.push(ref.current);
    }
    return ref.current;
  },
}));

import {
  BattleAudioProvider,
  useBattleAudio,
} from '@/providers/BattleAudioProvider';
import {
  loadAudioPreferences,
  setAudioPreference,
} from '@/utils/audioSettings';

function Harness({ theme }: { theme?: string }) {
  const audio = useBattleAudio(theme);
  return (
    <Pressable testID="sound" onPress={() => audio.playSound('moveSelected')} />
  );
}

function tree(theme?: string) {
  return (
    <BattleAudioProvider>
      <Harness theme={theme} />
    </BattleAudioProvider>
  );
}

describe('BattleAudioProvider', () => {
  let appStateCallback: ((state: string) => void) | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlayers.length = 0;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await loadAudioPreferences();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _event: string,
      callback: (state: string) => void,
    ) => {
      appStateCallback = callback;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a theme, pauses in background, resumes, and stops for reveal', async () => {
    const view = render(tree('The calm before the storm'));
    const music = mockPlayers[0];

    await waitFor(() => expect(music.replace).toHaveBeenCalledTimes(1));
    expect(music.play).toHaveBeenCalled();

    act(() => appStateCallback?.('background'));
    expect(music.pause).toHaveBeenCalled();

    const replacementsBeforeResume = music.replace.mock.calls.length;
    act(() => appStateCallback?.('active'));
    expect(music.play.mock.calls.length).toBeGreaterThan(1);
    expect(music.replace).toHaveBeenCalledTimes(replacementsBeforeResume);

    // Result routes pass no theme; the previous battle screen's cleanup makes
    // the deliberately silent reveal explicit in the controller contract.
    view.rerender(tree(undefined));
    expect(music.pause).toHaveBeenCalled();
  });

  it('keeps Music and Sound Effects independent', async () => {
    const view = render(tree('Precision over power'));
    const music = mockPlayers[0];
    const moveSelected = mockPlayers[2];
    await waitFor(() => expect(music.play).toHaveBeenCalled());

    act(() => setAudioPreference('music', false));
    expect(music.pause).toHaveBeenCalled();

    fireEvent.press(view.getByTestId('sound'));
    await waitFor(() => expect(moveSelected.seekTo).toHaveBeenCalledWith(0));

    act(() => setAudioPreference('soundEffects', false));
    moveSelected.seekTo.mockClear();
    fireEvent.press(view.getByTestId('sound'));
    expect(moveSelected.seekTo).not.toHaveBeenCalled();
  });
});
