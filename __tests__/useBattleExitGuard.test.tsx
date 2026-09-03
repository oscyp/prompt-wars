/**
 * The guard must stand down for navigation the player asked for. Before
 * `exitTo`, Continue on the face-off was a `router.replace`, which removes the
 * screen, which the armed guard intercepted with the leave dialog -- and a
 * confirming tap cancelled the battle. This pins the disarm-then-navigate
 * ordering that `usePreventRemove` requires.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useBattleExitGuard } from '@/hooks/useBattleExitGuard';

const mockPreventFlags: boolean[] = [];
let mockCapturedCallback: ((e: { data: { action: unknown } }) => void) | null =
  null;
const mockDispatch = jest.fn();
const mockConfirmLeave = jest.fn();

jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (
    prevent: boolean,
    cb: (e: { data: { action: unknown } }) => void,
  ) => {
    mockPreventFlags.push(prevent);
    mockCapturedCallback = cb;
  },
}));

const mockFocusListeners: (() => void)[] = [];
jest.mock('expo-router', () => ({
  useNavigation: () => ({
    dispatch: mockDispatch,
    addListener: (event: string, cb: () => void) => {
      if (event === 'focus') mockFocusListeners.push(cb);
      return () => {
        const i = mockFocusListeners.indexOf(cb);
        if (i >= 0) mockFocusListeners.splice(i, 1);
      };
    },
  }),
}));

jest.mock('@/hooks/useLeaveBattle', () => ({
  useLeaveBattle: () => ({
    price: 2,
    iHaveLocked: false,
    isLeaving: false,
    confirmLeave: mockConfirmLeave,
  }),
}));

function setup(enabled = true) {
  return renderHook(() =>
    useBattleExitGuard('battle-1', {
      format: 'bo3',
      mode: 'bot',
      isBot: true,
      prompts: [],
      myProfileId: 'me',
      enabled,
    }),
  );
}

beforeEach(() => {
  mockFocusListeners.length = 0;
  mockPreventFlags.length = 0;
  mockCapturedCallback = null;
  mockDispatch.mockClear();
  mockConfirmLeave.mockClear();
});

describe('useBattleExitGuard', () => {
  it('arms the guard while the battle is loaded', () => {
    setup();
    expect(mockPreventFlags.at(-1)).toBe(true);
  });

  it('stays down while the battle has not loaded', () => {
    setup(false);
    expect(mockPreventFlags.at(-1)).toBe(false);
  });

  it('exitTo disarms the guard before navigating and stays down afterwards', () => {
    const { result } = setup();
    const navigate = jest.fn(() => {
      // At the moment of navigation the latest render must have the guard down.
      expect(mockPreventFlags.at(-1)).toBe(false);
    });

    act(() => {
      result.current.exitTo(navigate);
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(mockConfirmLeave).not.toHaveBeenCalled();
    // expo-router queues the actual dispatch, so the guard must not come back
    // up on its own: still down after the navigate call returned.
    expect(mockPreventFlags.at(-1)).toBe(false);
  });

  it('re-arms only when the screen is focused again (a push, not a replace)', () => {
    const { result } = setup();
    act(() => {
      result.current.exitTo(() => {});
    });
    expect(mockPreventFlags.at(-1)).toBe(false);
    expect(mockFocusListeners).toHaveLength(1);

    act(() => {
      mockFocusListeners[0]();
    });
    expect(mockPreventFlags.at(-1)).toBe(true);
  });

  it('an intercepted removal asks first and hands the action back on confirm', () => {
    setup();
    const action = { type: 'POP' };
    act(() => {
      mockCapturedCallback?.({ data: { action } });
    });
    expect(mockConfirmLeave).toHaveBeenCalledTimes(1);
    const onLeft = mockConfirmLeave.mock.calls[0][0] as () => void;
    onLeft();
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });
});
