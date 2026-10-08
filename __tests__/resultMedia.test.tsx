import React from 'react';
import * as ReactNative from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ResultMedia from '@/components/battle/ResultMedia';
import ResultActions, {
  resultActionsHorizontal,
} from '@/components/battle/ResultActions';
import { resultMediaRoundNumber } from '@/components/battle/resultMediaView';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';

const mockEnterFullscreen = jest.fn<Promise<void>, []>();
const mockExitFullscreen = jest.fn<Promise<void>, []>();
let mockVideoProps: Record<string, unknown> = {};

jest.mock('expo-font', () => ({
  isLoaded: jest.fn(() => false),
  loadAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-video', () => {
  // Jest hoists this factory above module imports.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    VideoView: React.forwardRef(function MockVideoView(
      props: Record<string, unknown>,
      ref: React.ForwardedRef<unknown>,
    ) {
      mockVideoProps = props;
      React.useImperativeHandle(ref, () => ({
        enterFullscreen: mockEnterFullscreen,
        exitFullscreen: mockExitFullscreen,
      }));
      return React.createElement('VideoView', props);
    }),
  };
});
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: jest.fn(() => true),
}));

type Listener = () => void;

function player() {
  const listeners: Record<string, Listener> = {};
  return {
    loop: false,
    muted: true,
    volume: 0.35,
    currentTime: 27,
    play: jest.fn(),
    pause: jest.fn(),
    addListener: jest.fn((name: string, listener: Listener) => {
      listeners[name] = listener;
      return { remove: jest.fn() };
    }),
    listeners,
  };
}

function mediaProps(fake = player()) {
  return {
    videoUrl: 'https://example.com/cinematic.mp4',
    player: fake as never,
    playbackError: null,
    retry: jest.fn(),
    status: null,
    revised: false,
    roundNumber: 2,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVideoProps = {};
  mockEnterFullscreen.mockResolvedValue();
  mockExitFullscreen.mockResolvedValue();
  jest.mocked(useBattlePresentationActive).mockReturnValue(true);
});

test('keeps the playable frame free of duration and round headings', () => {
  const view = render(<ResultMedia {...mediaProps()} />);
  expect(view.queryByRole('header')).toBeNull();
  expect(view.queryByText(/second cinematic|Round 2/)).toBeNull();
  expect(mockVideoProps.accessibilityLabel).toBe('Round 2 cinematic');
});

test('shows a paused contained 220pt preview and plays only after fullscreen enters', async () => {
  const fake = player();
  const view = render(<ResultMedia {...mediaProps(fake)} />);

  expect(view.queryByText('Cinematic · Round 2')).toBeNull();
  expect(
    ReactNative.StyleSheet.flatten(
      view.getByTestId('cinematic-preview').props.style,
    ),
  ).toMatchObject({ height: 220 });
  expect(mockVideoProps).toMatchObject({
    nativeControls: false,
    contentFit: 'contain',
  });
  expect(fake.play).not.toHaveBeenCalled();

  await act(async () => {
    fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }), {
      currentTarget: 72,
    });
  });
  expect(mockEnterFullscreen).toHaveBeenCalledTimes(1);
  expect(fake.play).not.toHaveBeenCalled();

  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(fake.play).toHaveBeenCalledTimes(1);
  expect(mockVideoProps.nativeControls).toBe(true);

  act(() => fake.listeners.playToEnd());
  expect(mockVideoProps.nativeControls).toBe(true);
  act(() => (mockVideoProps.onFullscreenExit as () => void)());
  expect(mockVideoProps.nativeControls).toBe(false);
});

test('unmutes only after requested fullscreen entry and preserves the native volume', async () => {
  const fake = player();
  const view = render(<ResultMedia {...mediaProps(fake)} />);
  const audioAtPlay: boolean[] = [];
  fake.play.mockImplementation(() => {
    audioAtPlay.push(fake.muted);
  });

  // A native event without a user request must not start audio.
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(fake.muted).toBe(true);
  expect(audioAtPlay).toEqual([]);
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  });
  expect(fake.muted).toBe(true);
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(audioAtPlay).toEqual([false]);
  expect(fake.volume).toBe(0.35);
  act(() => (mockVideoProps.onFullscreenExit as () => void)());
  expect(fake.muted).toBe(true);
  expect(fake.volume).toBe(0.35);
});

test.each([
  'blur',
  'url replacement',
  'player replacement',
  'unmount',
] as const)(
  'remutes audible fullscreen playback on %s and rejects stale entry',
  async (reason) => {
    const fake = player();
    const props = mediaProps(fake);
    const view = render(<ResultMedia {...props} />);
    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
    });
    act(() => (mockVideoProps.onFullscreenEnter as () => void)());
    const staleEnter = mockVideoProps.onFullscreenEnter as () => void;
    // Exercise teardown independently even before audio entry is implemented.
    fake.muted = false;
    fake.play.mockClear();
    if (reason === 'blur') {
      jest.mocked(useBattlePresentationActive).mockReturnValue(false);
      view.rerender(<ResultMedia {...props} />);
    } else if (reason === 'url replacement') {
      view.rerender(
        <ResultMedia {...props} videoUrl="https://example.com/new.mp4" />,
      );
    } else if (reason === 'player replacement') {
      view.rerender(<ResultMedia {...props} player={player() as never} />);
    } else {
      view.unmount();
    }
    expect(fake.muted).toBe(true);
    expect(fake.pause).toHaveBeenCalled();
    expect(() => act(staleEnter)).not.toThrow();
    expect(fake.muted).toBe(true);
    expect(fake.play).not.toHaveBeenCalled();
  },
);

test('tolerates a mute setter released by Expo during cleanup', () => {
  const fake = player();
  const view = render(<ResultMedia {...mediaProps(fake)} />);
  Object.defineProperty(fake, 'muted', {
    set() {
      throw new Error('Cannot use shared object that was already released');
    },
  });
  expect(() => view.unmount()).not.toThrow();
});

test('does not play or throw if Expo releases the native mute setter during entry', async () => {
  const fake = player();
  const view = render(<ResultMedia {...mediaProps(fake)} />);
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  });
  Object.defineProperty(fake, 'muted', {
    set() {
      throw new Error('Cannot use shared object that was already released');
    },
  });
  expect(() =>
    act(() => (mockVideoProps.onFullscreenEnter as () => void)()),
  ).not.toThrow();
  expect(fake.play).not.toHaveBeenCalled();
});

test('blocks double opens, retries fullscreen presentation without media recovery, and resets a completed replay', async () => {
  let rejectOpen!: (error: Error) => void;
  mockEnterFullscreen.mockReturnValue(
    new Promise<void>((_resolve, reject) => {
      rejectOpen = reject;
    }),
  );
  const fake = player();
  const props = mediaProps(fake);
  const view = render(<ResultMedia {...props} />);

  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  expect(mockEnterFullscreen).toHaveBeenCalledTimes(1);
  await act(async () => rejectOpen(new Error('native presentation failed')));
  expect(view.getByText('Couldn’t open the cinematic.')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'Play cinematic' })).toBeNull();
  expect(view.getAllByRole('button')).toHaveLength(1);
  expect(props.retry).not.toHaveBeenCalled();

  mockEnterFullscreen.mockResolvedValue();
  await act(async () => {
    fireEvent.press(
      view.getByRole('button', { name: 'Retry opening cinematic' }),
    );
  });
  expect(mockEnterFullscreen).toHaveBeenCalledTimes(2);
  expect(props.retry).not.toHaveBeenCalled();

  act(() => fake.listeners.playToEnd());
  fake.currentTime = 41;
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(fake.currentTime).toBe(0);
});

test('restores focus to the remounted Play button after presentation retry', async () => {
  let rejectOpen!: (error: Error) => void;
  mockEnterFullscreen.mockReturnValueOnce(
    new Promise<void>((_resolve, reject) => {
      rejectOpen = reject;
    }),
  );
  const focus = jest
    .spyOn(ReactNative.AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  const view = render(<ResultMedia {...mediaProps()} />);

  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }), {
    currentTarget: 72,
  });
  await act(async () => rejectOpen(new Error('native presentation failed')));
  expect(view.queryByRole('button', { name: 'Play cinematic' })).toBeNull();

  mockEnterFullscreen.mockResolvedValue();
  await act(async () => {
    fireEvent.press(
      view.getByRole('button', { name: 'Retry opening cinematic' }),
    );
  });
  const remountedPlay = view.getByRole('button', { name: 'Play cinematic' });
  act(() =>
    remountedPlay.props.onLayout({
      currentTarget: 84,
      nativeEvent: {
        layout: { x: 0, y: 0, width: 120, height: 48 },
        target: 84,
      },
    }),
  );
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  act(() => (mockVideoProps.onFullscreenExit as () => void)());

  expect(focus).toHaveBeenLastCalledWith(84);
  expect(focus).not.toHaveBeenCalledWith(72);
  focus.mockRestore();
});

test('ignores a fullscreen entry left over from an expired signed URL', async () => {
  let finishOldOpen!: () => void;
  mockEnterFullscreen.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishOldOpen = resolve;
    }),
  );
  const fake = player();
  const props = mediaProps(fake);
  const view = render(<ResultMedia {...props} />);
  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));

  view.rerender(
    <ResultMedia {...props} videoUrl="https://example.com/refreshed.mp4" />,
  );
  await act(async () => finishOldOpen());
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(fake.play).not.toHaveBeenCalled();

  mockEnterFullscreen.mockResolvedValue();
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  });
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(fake.play).toHaveBeenCalledTimes(1);
});

test('invalidates a pending fullscreen open when the screen blurs before entry', () => {
  mockEnterFullscreen.mockReturnValue(new Promise<void>(() => {}));
  const fake = player();
  const props = mediaProps(fake);
  const view = render(<ResultMedia {...props} />);
  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));

  jest.mocked(useBattlePresentationActive).mockReturnValue(false);
  view.rerender(<ResultMedia {...props} />);
  expect(
    view.getByRole('button', { name: 'Play cinematic' }).props
      .accessibilityState,
  ).toMatchObject({ busy: false });
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  expect(fake.play).not.toHaveBeenCalled();
  expect(fake.pause).toHaveBeenCalled();
  expect(mockExitFullscreen).toHaveBeenCalledTimes(2);
  expect(mockVideoProps.nativeControls).toBe(true);
});

test('a stale fullscreen dismissal does not focus an inactive opener', () => {
  const focus = jest
    .spyOn(ReactNative.AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  mockEnterFullscreen.mockReturnValue(new Promise<void>(() => {}));
  const fake = player();
  const props = mediaProps(fake);
  const view = render(<ResultMedia {...props} />);
  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }), {
    currentTarget: 72,
  });

  jest.mocked(useBattlePresentationActive).mockReturnValue(false);
  view.rerender(<ResultMedia {...props} />);
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  act(() => (mockVideoProps.onFullscreenExit as () => void)());
  expect(mockExitFullscreen).toHaveBeenCalledTimes(2);
  expect(focus).not.toHaveBeenCalled();
  focus.mockRestore();
});

test('dismisses a pending native presentation when the player changes or media unmounts', () => {
  mockEnterFullscreen.mockReturnValue(new Promise<void>(() => {}));
  const first = player();
  const props = mediaProps(first);
  const view = render(<ResultMedia {...props} />);
  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));

  const replacement = player();
  view.rerender(<ResultMedia {...props} player={replacement as never} />);
  expect(mockExitFullscreen).toHaveBeenCalledTimes(1);
  expect(first.pause).toHaveBeenCalled();

  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  view.unmount();
  expect(mockExitFullscreen).toHaveBeenCalledTimes(2);
  expect(replacement.pause).toHaveBeenCalled();
});

test('does not call a released player from stale fullscreen callbacks after replacement', () => {
  const first = player();
  const props = mediaProps(first);
  const view = render(<ResultMedia {...props} />);
  fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }));
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  const staleExit = mockVideoProps.onFullscreenExit as () => void;

  const replacement = player();
  view.rerender(<ResultMedia {...props} player={replacement as never} />);
  first.pause.mockImplementation(() => {
    throw new Error(
      "Calling the 'pause' function failed: NativeSharedObjectNotFoundException",
    );
  });

  expect(() => act(staleExit)).not.toThrow();
  expect(first.pause).toHaveBeenCalledTimes(1);
  expect(replacement.pause).not.toHaveBeenCalled();
});

test('tolerates expo releasing the player before replacement and unmount cleanup', () => {
  const released = () => {
    throw new Error(
      'Unable to find the native shared object associated with given JavaScript object',
    );
  };
  const first = player();
  first.pause.mockImplementation(released);
  const props = mediaProps(first);
  const view = render(<ResultMedia {...props} />);

  const replacement = player();
  expect(() => {
    view.rerender(<ResultMedia {...props} player={replacement as never} />);
  }).not.toThrow();

  replacement.pause.mockImplementation(released);
  expect(() => view.unmount()).not.toThrow();
});

test('pauses on fullscreen close and presentation inactivity, retains position, and restores opener focus', async () => {
  const focus = jest
    .spyOn(ReactNative.AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  const findNode = jest
    .spyOn(ReactNative, 'findNodeHandle')
    .mockImplementation(() => 72);
  const fake = player();
  const props = mediaProps(fake);
  const view = render(<ResultMedia {...props} />);

  await act(async () => {
    fireEvent.press(view.getByRole('button', { name: 'Play cinematic' }), {
      currentTarget: 72,
    });
  });
  act(() => (mockVideoProps.onFullscreenEnter as () => void)());
  fake.currentTime = 19;
  act(() => (mockVideoProps.onFullscreenExit as () => void)());
  expect(fake.pause).toHaveBeenCalled();
  expect(fake.currentTime).toBe(19);
  expect(focus).toHaveBeenCalledWith(72);

  jest.mocked(useBattlePresentationActive).mockReturnValue(false);
  view.rerender(<ResultMedia {...props} />);
  expect(fake.pause).toHaveBeenCalledTimes(2);
  findNode.mockRestore();
  focus.mockRestore();
});

test('keeps playback recovery separate and removes captions from the result media surface', () => {
  const retry = jest.fn();
  const view = render(
    <ResultMedia
      {...mediaProps()}
      videoUrl={null}
      playbackError="signed URL failed"
      retry={retry}
    />,
  );
  fireEvent.press(view.getByRole('button', { name: 'Retry loading media' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(view.queryByText('Captions')).toBeNull();
  expect(view.queryByText(/transcript/i)).toBeNull();
});

test('keeps the actual job round accessible and marks reviewed media once', () => {
  const rounds = [
    { id: 'round-1', round_number: 1 },
    { id: 'round-2', round_number: 2 },
    { id: 'round-3', round_number: 3 },
  ];
  expect(resultMediaRoundNumber({ battle_round_id: 'round-2' }, rounds)).toBe(
    2,
  );
  expect(
    resultMediaRoundNumber({ battle_round_id: 'missing' }, rounds),
  ).toBeNull();
  expect(resultMediaRoundNumber({ battle_round_id: null }, rounds)).toBeNull();

  const view = render(
    <ResultMedia {...mediaProps()} revised roundNumber={2} />,
  );
  expect(view.queryByText('Cinematic · Round 2')).toBeNull();
  expect(view.getAllByText('Before review')).toHaveLength(1);
  expect(view.queryByText(/original cinematic before review/i)).toBeNull();
});

test.each([
  [402, 1, 'row'],
  [389, 1, 'column'],
  [402, 1.2, 'column'],
] as const)(
  'lays out shared actions at width %s and font scale %s as %s',
  (width, fontScale, direction) => {
    expect(resultActionsHorizontal(width, fontScale)).toBe(direction === 'row');
  },
);

test('hides video sharing after playback failure and explains the disabled historical state', () => {
  const props = {
    onShareCard: jest.fn(),
    onShareVideo: jest.fn(),
    onReplay: jest.fn(),
    busy: false,
  };
  const failed = render(
    <ResultActions {...props} videoPlayable={false} revised={false} />,
  );
  expect(failed.queryByRole('button', { name: 'Share video' })).toBeNull();
  failed.unmount();

  const historical = render(<ResultActions {...props} videoPlayable revised />);
  expect(
    historical
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual(['Share card', 'Share video', 'Replay reveal']);
  expect(
    historical.getByRole('button', { name: 'Share video' }).props
      .accessibilityState,
  ).toMatchObject({ disabled: true });
  expect(historical.getByText('Sharing unavailable')).toBeTruthy();
  expect(historical.queryByText(/Before review/)).toBeNull();
  fireEvent.press(historical.getByRole('button', { name: 'Share card' }));
  fireEvent.press(historical.getByRole('button', { name: 'Replay reveal' }));
  fireEvent.press(historical.getByRole('button', { name: 'Share video' }));
  expect(props.onShareCard).toHaveBeenCalledTimes(1);
  expect(props.onReplay).toHaveBeenCalledTimes(1);
  expect(props.onShareVideo).not.toHaveBeenCalled();
});
