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
  released: boolean;
}> = [];
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: () => {
    const React = jest.requireActual('react') as typeof import('react');
    const ref = React.useRef<(typeof mockPlayers)[number] | null>(null);
    if (!ref.current) {
      const player: (typeof mockPlayers)[number] = {
        pause: jest.fn(),
        play: jest.fn(),
        replace: jest.fn(),
        seekTo: jest.fn(() => Promise.resolve()),
        loop: false,
        volume: 1,
        released: false,
      };
      player.pause.mockImplementation(() => {
        if (player.released) throw new Error('AudioPlayer has been released');
      });
      player.play.mockImplementation(() => {
        if (player.released) throw new Error('AudioPlayer has been released');
      });
      player.replace.mockImplementation(() => {
        if (player.released) throw new Error('AudioPlayer has been released');
      });
      ref.current = player;
      mockPlayers.push(player);
    }

    const player = ref.current;
    React.useEffect(
      () => () => {
        player.released = true;
      },
      [player],
    );

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

  it('uses an iOS-compatible audio mode that respects the silent switch', async () => {
    const { setAudioModeAsync } = jest.requireMock('expo-audio') as {
      setAudioModeAsync: jest.Mock;
    };

    render(tree());

    await waitFor(() =>
      expect(setAudioModeAsync).toHaveBeenCalledWith({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        allowsRecording: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      }),
    );
  });

  it('does not touch released native players when the battle layout unmounts', async () => {
    const view = render(tree('The calm before the storm'));
    await waitFor(() => expect(mockPlayers[0].play).toHaveBeenCalled());

    expect(() => view.unmount()).not.toThrow();
    expect(mockPlayers.every((player) => player.released)).toBe(true);
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
