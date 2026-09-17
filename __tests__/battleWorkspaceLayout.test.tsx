import React from 'react';
import {
  act,
  fireEvent,
  render,
  within,
  waitFor,
} from '@testing-library/react-native';
import { Alert, Keyboard, StyleSheet, useWindowDimensions } from 'react-native';
import PromptEntryScreen from '@/app/(battle)/prompt-entry';

const mockTheme =
  'The final library beyond the forgotten mountains, where every written word protects another world';
const mockDraftText =
  'I weave a shield of living words around the final book of the library.';
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
const mockAuth = { user: { id: 'player-one' } };
const mockParams = { battleId: 'battle-one', round: '1' };
const mockDraft = {
  ready: true,
  error: null,
  draft: { text: mockDraftText, move: 'attack', editMode: true },
  save: jest.fn(async () => {}),
  clear: jest.fn(async () => true),
  flush: jest.fn(async () => {}),
  retry: jest.fn(async () => true),
};
const mockRealtime = {
  battle: {
    id: 'battle-one',
    theme: mockTheme,
    status: 'waiting_prompts',
    mode: 'ranked',
    player_one_id: 'player-one',
    player_two_id: 'player-two',
    is_player_two_bot: false,
    best_of: 3,
    current_round: 1,
    player_one_hp: 72,
    player_two_hp: 38,
    player_one_hp_max: 110,
    player_two_hp_max: 95,
    player_one_rounds_won: 1,
    player_two_rounds_won: 0,
  },
  prompts: [],
  rounds: [
    {
      round_number: 1,
      status: 'waiting_prompts',
      lock_in_deadline: '2099-09-15T22:00:00Z',
    },
  ],
  format: 'bo3',
  current_round: 1,
  series_score: { p1: 1, p2: 0 },
  hp: { p1: 100, p2: 100 },
  hp_max: { p1: 100, p2: 100 },
  isSubscribed: true,
};
const mockCharacters = {
  p1: {
    name: 'Mira Keeper of the Faraway Library',
    archetype: 'mystic',
    signatureColor: '#CCAAFF',
  },
  p2: {
    name: 'Rook Guardian of the Last Ember',
    archetype: 'warrior',
    signatureColor: '#FF9977',
  },
  refreshPortraits: jest.fn(),
};
const mockLeave = {
  park: jest.fn(),
  confirmLeave: jest.fn(),
  exitTo: jest.fn(),
  isLeaving: false,
  canForfeit: true,
};
const mockAudio = { playSound: jest.fn() };
const mockViewer = {
  visible: false,
  viewer: null,
  canOpen: () => false,
  open: jest.fn(),
  close: jest.fn(),
  handleError: jest.fn(),
};

jest.mock('react-native-reanimated', () => {
  const mock = require('react-native-reanimated/mock');
  return {
    ...mock,
    useSharedValue: (value: unknown) =>
      require('react').useRef({ value }).current,
  };
});

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => true) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
}));
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/providers/BattleAudioProvider', () => ({
  useBattleAudio: () => mockAudio,
}));
jest.mock('@/hooks/useRealtimeBattle', () => ({
  useRealtimeBattle: () => mockRealtime,
}));
jest.mock('@/hooks/useBattleDraft', () => ({
  useBattleDraft: () => mockDraft,
}));
jest.mock('@/hooks/useBattleCharacters', () => ({
  useBattleCharacters: () => mockCharacters,
}));
jest.mock('@/hooks/useBattleExitGuard', () => ({
  useBattleExitGuard: () => mockLeave,
}));
jest.mock('@/hooks/usePortraitViewer', () => ({
  usePortraitViewer: () => mockViewer,
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => true,
}));
jest.mock('@/utils/tutorial', () => ({ recordFunnelEvent: jest.fn() }));
jest.mock('@/utils/editCooldowns', () => ({
  fetchEditPrice: async () => ({ credits: 1 }),
}));
jest.mock('@/utils/battles', () => ({
  getBattle: async () => ({ theme: mockTheme }),
  getMoveSuggestions: async () => [
    {
      title: 'Idea',
      body: 'An idea that should never replace the user writing.',
    },
  ],
  generateMoveSuggestions: jest.fn(),
  submitPrompt: jest.fn(),
}));
jest.mock('@/utils/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticImpact: jest.fn(),
  hapticWarning: jest.fn(),
}));
jest.mock('@/components/BattleOpponentSafety', () => () => null);
jest.mock('@/components/TutorialCoach', () => () => null);
jest.mock('@/components/PortraitViewer', () => () => null);
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

test.each([
  [320, 568, 1],
  [375, 667, 1],
  [375, 667, 2],
] as const)(
  'long matchup and theme scroll at %s×%s scale %s while editing remains mounted',
  async (width, height, fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, height, fontScale, scale: 3 });
    const callbacks: Record<
      string,
      Parameters<typeof Keyboard.addListener>[1]
    > = {};
    const originalAddListener = Keyboard.addListener.bind(Keyboard);
    const keyboardEvent = {
      duration: 0,
      easing: 'keyboard' as const,
      endCoordinates: { width, height: 300, screenX: 0, screenY: height - 300 },
    };
    const listener = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation((name, callback) => {
        callbacks[name] = callback;
        return originalAddListener(name, callback);
      });
    const screen = render(<PromptEntryScreen />);
    const editor = await screen.findByTestId('battle-prompt-editor');
    const scroll = screen.getByTestId('battle-workspace-scroll');
    expect(within(scroll).getByTestId('battle-workspace-context')).toBeTruthy();
    expect(within(scroll).getByText(mockTheme)).toBeTruthy();
    expect(within(scroll).getByText(mockCharacters.p1.name)).toBeTruthy();
    expect(within(scroll).queryByTestId('battle-workspace-footer')).toBeNull();
    expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({
      flex: 1,
      minHeight: 0,
    });
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(false);
    expect(editor.props.value).toBe(mockDraftText);

    const typed = `${mockDraftText} Every falling brick becomes a letter.`;
    fireEvent.changeText(editor, typed);
    fireEvent(editor, 'focus');
    act(() => callbacks.keyboardDidShow(keyboardEvent));
    fireEvent(scroll, 'layout', {
      nativeEvent: { layout: { width, height: 180, x: 0, y: 0 } },
    });
    fireEvent.press(
      screen.getByRole('radio', { name: 'Defense. Beats Attack' }),
    );
    await waitFor(() =>
      expect(mockDraft.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: typed,
          move: 'defense',
          editMode: true,
        }),
      ),
    );
    expect(screen.getByTestId('battle-prompt-editor')).toBe(editor);
    expect(editor.props.value).toBe(typed);
    expect(screen.getByTestId('battle-workspace-footer')).toBeTruthy();
    expect(within(scroll).getByTestId('battle-workspace-context')).toBeTruthy();
    act(() => callbacks.keyboardDidHide(keyboardEvent));
    expect(screen.getByTestId('battle-prompt-editor')).toBe(editor);
    screen.unmount();
    listener.mockRestore();
  },
);

async function openWorkspace() {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  const screen = render(<PromptEntryScreen />);
  await screen.findByTestId('battle-prompt-editor');
  await act(async () => {});
  return screen;
}

test('opening Ideas while typing keeps the exact native editor and draft', async () => {
  const screen = await openWorkspace();
  const editor = screen.getByTestId('battle-prompt-editor');
  fireEvent.changeText(editor, mockDraftText + ' My ending.');
  fireEvent.press(screen.getByLabelText('Open prompt ideas'));
  expect(screen.getByTestId('battle-prompt-editor')).toBe(editor);
  expect(editor.props.value).toBe(mockDraftText + ' My ending.');
  expect(
    screen.getByText(/First idea set per move and round is free/),
  ).toBeTruthy();
  await act(async () => {});
});

test('player two sees source HP and the integrated score in viewer order', async () => {
  mockAuth.user.id = 'player-two';
  const screen = await openWorkspace();
  expect(screen.getByLabelText('Series: you 0, opponent 1.')).toBeTruthy();
  expect(
    screen.getByLabelText('Rook Guardian of the Last Ember: 38 HP out of 95'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(
      'Mira Keeper of the Faraway Library: 72 HP out of 110',
    ),
  ).toBeTruthy();
  expect(screen.getAllByTestId('battle-integrated-score')).toHaveLength(1);
  screen.unmount();
  mockAuth.user.id = 'player-one';
});

test('hold cancellation retains text; completing a hold submits exactly once and retains failed draft', async () => {
  const { submitPrompt } = require('@/utils/battles');
  submitPrompt.mockReset().mockResolvedValue({ success: false, status: 500 });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace();
  mockDraft.clear.mockClear();
  jest.useFakeTimers();
  const button = screen.getByTestId('battle-lock-in');
  fireEvent(button, 'pressIn');
  act(() => jest.advanceTimersByTime(300));
  fireEvent(button, 'pressOut');
  act(() => jest.advanceTimersByTime(500));
  expect(submitPrompt).not.toHaveBeenCalled();
  expect(screen.getByTestId('battle-prompt-editor').props.value).toBe(
    mockDraftText,
  );
  fireEvent(button, 'pressIn');
  fireEvent(button, 'pressIn');
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  expect(mockDraft.clear).not.toHaveBeenCalled();
  expect(screen.getByTestId('battle-prompt-editor').props.value).toBe(
    mockDraftText,
  );
  expect(screen.getByText('HOLD TO TRY AGAIN')).toBeTruthy();
  screen.unmount();
  jest.useRealTimers();
  await act(async () => {});
  alert.mockRestore();
});

test('confirmation submits once, and invalid writing cannot start submission', async () => {
  const { submitPrompt } = require('@/utils/battles');
  submitPrompt.mockReset().mockResolvedValue({ success: false, status: 500 });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace();
  fireEvent.press(screen.getByText('Use confirmation instead'));
  const buttons = alert.mock.calls.find(([title]) => title === 'Lock in?')?.[2];
  expect(buttons?.[0].text).toBe('Cancel');
  await act(async () => {
    buttons?.[1].onPress?.();
    buttons?.[1].onPress?.();
  });
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  fireEvent.changeText(screen.getByTestId('battle-prompt-editor'), 'short');
  expect(
    screen.getByTestId('battle-lock-in').props.accessibilityState.disabled,
  ).toBe(true);
  fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  await act(async () => {});
  alert.mockRestore();
});

test('practice names the AI opponent and legacy single hides series metadata', async () => {
  const oldFormat = mockRealtime.format;
  mockRealtime.format = 'single';
  mockRealtime.battle.is_player_two_bot = true;
  const screen = await openWorkspace();
  expect(screen.getByText('Practice · AI opponent')).toBeTruthy();
  expect(screen.getByText('YOUR MOVE')).toBeTruthy();
  expect(screen.queryByText(/First to 2 wins/)).toBeNull();
  expect(screen.queryByTestId('battle-integrated-score')).toBeNull();
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  screen.unmount();
  mockRealtime.format = oldFormat;
  mockRealtime.battle.is_player_two_bot = false;
});

test('nullable source metadata hides HP and score instead of inventing defaults', async () => {
  const battle = { ...mockRealtime.battle };
  Object.assign(mockRealtime.battle, {
    player_one_hp: null,
    player_two_hp: null,
    player_one_rounds_won: null,
  });
  const screen = await openWorkspace();
  expect(screen.queryByTestId('battle-integrated-score')).toBeNull();
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  screen.unmount();
  Object.assign(mockRealtime.battle, battle);
});

test('accepted submission stays unavailable when local draft cleanup fails', async () => {
  const { submitPrompt } = require('@/utils/battles');
  submitPrompt.mockReset().mockResolvedValue({ success: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace();
  mockDraft.clear.mockResolvedValueOnce(false);
  fireEvent.press(screen.getByText('Discard draft'));
  const staleDiscard = alert.mock.calls.find(
    ([title]) => title === 'Discard draft?',
  )?.[2]?.[1].onPress;
  fireEvent.press(screen.getByText('Use confirmation instead'));
  const buttons = alert.mock.calls.find(([title]) => title === 'Lock in?')?.[2];
  await act(async () => {
    buttons?.[1].onPress?.();
  });
  expect(screen.getByText('PROMPT LOCKED IN')).toBeTruthy();
  expect(
    screen.getByTestId('battle-lock-in').props.accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByTestId('battle-prompt-editor')).toBeNull();
  expect(
    screen.queryByRole('radio', { name: 'Defense. Beats Attack' }),
  ).toBeNull();
  expect(screen.queryByText('Discard draft')).toBeNull();
  expect(screen.queryByLabelText('Open prompt ideas')).toBeNull();
  expect(screen.getByText(mockDraftText)).toBeTruthy();
  mockDraft.clear.mockClear();
  act(() => staleDiscard?.());
  expect(mockDraft.clear).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Use confirmation instead'));
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('stale confirmation cannot submit after the route changes round', async () => {
  const { submitPrompt } = require('@/utils/battles');
  submitPrompt.mockReset();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace();
  fireEvent.press(screen.getByText('Use confirmation instead'));
  const confirm = alert.mock.calls.find(
    ([title]) => title === 'Lock in?',
  )?.[2]?.[1].onPress;
  mockParams.round = '2';
  screen.rerender(<PromptEntryScreen />);
  await act(async () => {
    confirm?.();
  });
  expect(submitPrompt).not.toHaveBeenCalled();
  expect(screen.getByTestId('battle-prompt-editor').props.value).toBe(
    mockDraftText,
  );
  screen.unmount();
  mockParams.round = '1';
  alert.mockRestore();
});

test('a previous round response cannot clear or navigate the current round', async () => {
  const { submitPrompt } = require('@/utils/battles');
  let finish: (result: { success: boolean }) => void = () => {};
  submitPrompt.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace();
  fireEvent.press(screen.getByText('Use confirmation instead'));
  const confirm = alert.mock.calls.find(
    ([title]) => title === 'Lock in?',
  )?.[2]?.[1].onPress;
  await act(async () => {
    confirm?.();
  });
  mockParams.round = '2';
  screen.rerender(<PromptEntryScreen />);
  mockDraft.clear.mockClear();
  mockLeave.exitTo.mockClear();
  await act(async () => {
    finish({ success: true });
  });
  expect(mockDraft.clear).not.toHaveBeenCalled();
  expect(mockLeave.exitTo).not.toHaveBeenCalled();
  expect(screen.getByTestId('battle-prompt-editor').props.editable).toBe(true);
  expect(screen.getByTestId('battle-prompt-editor').props.value).toBe(
    mockDraftText,
  );
  screen.unmount();
  mockParams.round = '1';
  alert.mockRestore();
});
