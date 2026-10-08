import React from 'react';
import {
  act,
  fireEvent,
  render,
  within,
  waitFor,
} from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import PromptEntryScreen from '@/app/(battle)/prompt-entry';
import { rerollMoveStepSuggestions } from '@/utils/moveStepSuggestions';
import { PromptLockConfirmation } from '@/components/battle/PromptLockConfirmation';
import { ComposerMoveTypeControl } from '@/components/battle/PromptComposerPanel';
import {
  generateMoveSuggestions,
  completeMoveSuggestion,
  getMoveSuggestions,
  ensureFreeMoveSuggestionBanks,
  submitPrompt as mockSubmitPrompt,
} from '@/utils/battles';
import {
  composerReducer,
  createComposerState,
  composerDraftSnapshot,
} from '@/utils/promptComposer';
import { getFallbackMoveSuggestions } from '@/utils/promptSituations';
import type { SituationSnapshot } from '@/types/battle';

let mockRerollCredits = 1;

const mockTheme =
  'The final library beyond the forgotten mountains, where every written word protects another world';
afterEach(() => jest.restoreAllMocks());
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
const mockComposerTrack = jest.fn();
jest.mock('@/hooks/useComposerTelemetry', () => ({
  useComposerTelemetry: () => ({ track: mockComposerTrack }),
}));
const mockAudio = { playSound: jest.fn() };
let mockPresentationActive = true;
const mockViewer = {
  visible: false,
  viewer: null,
  canOpen: () => false,
  open: jest.fn(),
  close: jest.fn(),
  handleError: jest.fn(),
};

jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  return {
    ...mock,
    useSharedValue: (value: unknown) =>
      jest.requireActual('react').useRef({ value }).current,
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
  useBattlePresentationActive: () => mockPresentationActive,
}));
jest.mock('@/utils/tutorial', () => ({ recordFunnelEvent: jest.fn() }));
jest.mock('@/utils/moveStepSuggestions', () => ({
  ...jest.requireActual('@/utils/moveStepSuggestions'),
  rerollMoveStepSuggestions: jest.fn(),
}));
jest.mock('@/utils/editCooldowns', () => ({
  fetchEditPrice: async () => ({ credits: mockRerollCredits }),
}));
jest.mock('@/utils/battles', () => ({
  leaveActionLabel: jest.requireActual('@/utils/battles').leaveActionLabel,
  hasOpponent: jest.requireActual('@/utils/battles').hasOpponent,
  getBattle: async () => ({ theme: mockTheme }),
  getMoveSuggestions: jest.fn(async (_battleId, moveType) =>
    'prompt_experience_version' in mockRealtime.battle
      ? {
          status: 'ready',
          suggestions: jest
            .requireActual('@/utils/promptSituations')
            .getFallbackMoveSuggestions({
              moveType,
              situation: { id: 'storm-1', catalogVersion: 1 },
            })
            .map((option: { id: string }) => ({
              ...option,
              id: `ai:${option.id}`,
            })),
        }
      : {
          status: 'ready',
          suggestions: [
            {
              title: 'Idea',
              body: 'An idea that should never replace the user writing.',
            },
          ],
        },
  ),
  generateMoveSuggestions: jest.fn(),
  completeMoveSuggestion: jest.fn(async () => ({
    status: 'failed',
    error: 'unavailable',
    remainingAdaptations: 6,
  })),
  ensureFreeMoveSuggestionBanks: jest.fn(async () => ({})),
  getOpponentMoveHistory: jest.fn(async () => []),
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
    expect(
      screen.getByTestId('battle-prompt-editor', {
        includeHiddenElements: true,
      }),
    ).toBe(editor);
    expect(editor.props.value).toBe(typed);
    expect(screen.getByTestId('battle-workspace-footer')).toBeTruthy();
    expect(within(scroll).getByTestId('battle-workspace-context')).toBeTruthy();
    act(() => callbacks.keyboardDidHide(keyboardEvent));
    expect(
      screen.getByTestId('battle-prompt-editor', {
        includeHiddenElements: true,
      }),
    ).toBe(editor);
    screen.unmount();
    listener.mockRestore();
  },
);

async function openWorkspace({ screenReaderEnabled = false } = {}) {
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockResolvedValue(screenReaderEnabled);
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  const screen = render(<PromptEntryScreen />);
  await screen.findByTestId('battle-prompt-editor', {
    includeHiddenElements: true,
  });
  await act(async () => {});
  return screen;
}

test('opening Ideas while typing keeps the exact native editor and draft', async () => {
  const screen = await openWorkspace();
  const editor = screen.getByTestId('battle-prompt-editor', {
    includeHiddenElements: true,
  });
  fireEvent.changeText(editor, mockDraftText + ' My ending.');
  fireEvent.press(screen.getByLabelText('Use a generated idea'));
  expect(screen.queryByLabelText('Open prompt ideas')).toBeNull();
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true }),
  ).toBe(editor);
  expect(editor.props.value).toBe(mockDraftText + ' My ending.');
  expect(
    screen.getByText(/First idea set per move and round is free/),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Writing tips' }));
  expect(screen.getByText(/15–80 words/)).toBeTruthy();
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true }),
  ).toBe(editor);
  await act(async () => {});
});

test('changing the move type in legacy Ideas preserves the existing manual prompt', async () => {
  const screen = await openWorkspace();
  const editor = screen.getByTestId('battle-prompt-editor', {
    includeHiddenElements: true,
  });
  const prose = `${mockDraftText} I keep the final page dry.`;
  fireEvent.changeText(editor, prose);
  fireEvent.press(screen.getByLabelText('Use a generated idea'));
  fireEvent.press(screen.getByRole('radio', { name: 'Defense. Beats Attack' }));
  expect(editor.props.value).toBe(prose);
  await waitFor(() =>
    expect(mockDraft.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: prose, move: 'defense' }),
    ),
  );
  screen.unmount();
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
  const submitPrompt = jest.mocked(mockSubmitPrompt);
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
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true })
      .props.value,
  ).toBe(mockDraftText);
  fireEvent(button, 'pressIn');
  fireEvent(button, 'pressIn');
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  expect(mockDraft.clear).not.toHaveBeenCalled();
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true })
      .props.value,
  ).toBe(mockDraftText);
  expect(screen.getByText('HOLD TO TRY AGAIN')).toBeTruthy();
  screen.unmount();
  jest.useRealTimers();
  await act(async () => {});
  alert.mockRestore();
});

test('screen-reader confirmation submits once, and invalid writing cannot start submission', async () => {
  const submitPrompt = jest.mocked(mockSubmitPrompt);
  submitPrompt.mockReset().mockResolvedValue({ success: false, status: 500 });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace({ screenReaderEnabled: true });
  fireEvent.press(screen.getByTestId('battle-lock-in'));
  const buttons = alert.mock.calls.find(([title]) => title === 'Lock in?')?.[2];
  expect(buttons?.[0].text).toBe('Cancel');
  await act(async () => {
    buttons?.[1].onPress?.();
    buttons?.[1].onPress?.();
  });
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  fireEvent.changeText(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true }),
    'short',
  );
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
  const submitPrompt = jest.mocked(mockSubmitPrompt);
  submitPrompt.mockReset().mockResolvedValue({ success: true });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace({ screenReaderEnabled: true });
  mockDraft.clear.mockResolvedValueOnce(false);
  fireEvent.press(screen.getByTestId('battle-lock-in'));
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
  fireEvent.press(screen.getByTestId('battle-lock-in'));
  expect(submitPrompt).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('stale confirmation cannot submit after the route changes round', async () => {
  const submitPrompt = jest.mocked(mockSubmitPrompt);
  submitPrompt.mockReset();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace({ screenReaderEnabled: true });
  fireEvent.press(screen.getByTestId('battle-lock-in'));
  const confirm = alert.mock.calls.find(
    ([title]) => title === 'Lock in?',
  )?.[2]?.[1].onPress;
  mockParams.round = '2';
  screen.rerender(<PromptEntryScreen />);
  await act(async () => {
    confirm?.();
  });
  expect(submitPrompt).not.toHaveBeenCalled();
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true })
      .props.value,
  ).toBe(mockDraftText);
  screen.unmount();
  mockParams.round = '1';
  alert.mockRestore();
});

test('a previous round response cannot clear or navigate the current round', async () => {
  const submitPrompt = jest.mocked(mockSubmitPrompt);
  let finish: (result: { success: boolean }) => void = () => {};
  submitPrompt.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace({ screenReaderEnabled: true });
  fireEvent.press(screen.getByTestId('battle-lock-in'));
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
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true })
      .props.editable,
  ).toBe(true);
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true })
      .props.value,
  ).toBe(mockDraftText);
  screen.unmount();
  mockParams.round = '1';
  alert.mockRestore();
});

test.each([1, 3])(
  'shows structured live idea price %s and preserves explicit spending confirmation',
  async (price) => {
    mockRerollCredits = price;
    const generate = jest.mocked(generateMoveSuggestions);
    generate
      .mockReset()
      .mockResolvedValue({ suggestions: [], credits_spent: price } as never);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await openWorkspace();
    fireEvent.press(screen.getByLabelText('Use a generated idea'));
    const spoken = `${price} credit${price === 1 ? '' : 's'}`;
    expect(screen.getByLabelText(`${price} credits`)).toBeTruthy();
    expect(
      screen.getByText('Ideas do not guarantee a higher score.'),
    ).toBeTruthy();
    const button = screen.getByRole('button', {
      name: `Generate three new ideas for ${spoken}`,
    });
    expect(
      within(button).getByText(String(price), { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.queryByText(new RegExp(`${price} cr(?:\\b|$)`))).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    fireEvent.press(button);
    expect(alert).toHaveBeenCalledWith(
      'New ideas',
      `Generate three new ideas for ${spoken}?`,
      expect.any(Array),
    );
    const choices = alert.mock.calls.find(
      ([title]) => title === 'New ideas',
    )?.[2];
    expect(choices?.[0]).toMatchObject({ text: 'Cancel', style: 'cancel' });
    expect(choices?.[1].text).toBe(`Spend ${spoken}`);
    expect(generate).not.toHaveBeenCalled();
    await act(async () => choices?.[1].onPress?.());
    expect(generate).toHaveBeenCalledTimes(1);
    screen.unmount();
    mockRerollCredits = 1;
  },
);

test('included idea refresh keeps its allowance and confirmation without a paid price', async () => {
  mockRerollCredits = 0;
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = await openWorkspace();
  fireEvent.press(screen.getByLabelText('Use a generated idea'));
  expect(
    screen.getByText('First idea set per move and round is free.'),
  ).toBeTruthy();
  expect(screen.getByText('Next set included.')).toBeTruthy();
  expect(screen.queryByLabelText('0 credits')).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'Generate three new ideas' }),
  );
  expect(alert).toHaveBeenCalledWith(
    'New ideas',
    'Generate three new ideas? It takes a few seconds.',
    expect.any(Array),
  );
  const choices = alert.mock.calls.find(
    ([title]) => title === 'New ideas',
  )?.[2];
  expect(choices?.[1].text).toBe('Generate');
  screen.unmount();
  mockRerollCredits = 1;
});

function enterBuilderAction(
  screen: ReturnType<typeof render>,
  type = 'Attack',
) {
  if (screen.queryByRole('button', { name: 'Build move' })) {
    fireEvent.press(screen.getByRole('button', { name: 'Build move' }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  }
  fireEvent.press(screen.getByRole('radio', { name: type }));
}
function enterManualWriting(screen: ReturnType<typeof render>) {
  for (
    let i = 0;
    i < 4 && !screen.queryByRole('button', { name: 'Write your own prompt' });
    i++
  ) {
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  }
  fireEvent.press(
    screen.getByRole('button', { name: 'Write your own prompt' }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
}

test('composer choices produce a complete three-part prompt and preserve independent manual writing', async () => {
  const previousDraft = mockDraft.draft;
  mockDraft.draft = null as never;
  Object.assign(mockRealtime.battle, { prompt_experience_version: 2 });
  Object.assign(mockRealtime.rounds[0], {
    situation_snapshot: {
      id: 'storm-1',
      catalogVersion: 1,
      environmentId: 'storm-citadel',
      text: 'A banner hangs beside the terrace pillar.',
    },
  });
  const choices = getFallbackMoveSuggestions({
    moveType: 'attack',
    situation: { id: 'storm-1', catalogVersion: 1 } as SituationSnapshot,
  });
  const screen = await openWorkspace();
  const editor = screen.getByTestId('battle-prompt-editor', {
    includeHiddenElements: true,
  });
  enterBuilderAction(screen);
  fireEvent.press(screen.getByRole('radio', { name: choices[0].action }));
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(
    screen.getByRole('button', { name: 'Next' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(
    screen.getByRole('radio', { name: choices[0].intentHints![0].text }),
  );
  expect(editor.props.value).toBe(
    `${choices[0].action} ${choices[0].intentHints![0].text}`,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(
    screen.getByRole('button', { name: 'Next' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  fireEvent.press(
    screen.getByRole('radio', {
      name: choices[0].intentHints![0].approachHints![0].text,
    }),
  );
  const complete = `${choices[0].action} ${choices[0].intentHints![0].text} ${choices[0].intentHints![0].approachHints![0].text}`;
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(
    screen.getByTestId('battle-lock-in').props.accessibilityState.disabled,
  ).toBe(false);
  expect(editor.props.value).toBe(complete);
  expect(mockComposerTrack).toHaveBeenCalledWith(
    'composer_action_selected',
    'suggestion',
  );
  expect(mockComposerTrack).toHaveBeenCalledWith(
    'composer_intent_selected',
    'suggestion',
  );
  for (let i = 0; i < 3; i++)
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  enterManualWriting(screen);
  expect(editor.props.value).toBe(complete);
  fireEvent.changeText(
    editor,
    'I have my own idea and I want it to survive every switch.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  fireEvent.press(screen.getByRole('button', { name: 'Build move' }));
  fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(editor.props.value).toBe(complete);
  enterManualWriting(screen);
  expect(editor.props.value).toBe(
    'I have my own idea and I want it to survive every switch.',
  );
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true }),
  ).toBe(editor);
  expect(screen.queryByText('Good length')).toBeNull();
  screen.unmount();
  mockDraft.draft = previousDraft;
  delete (mockRealtime.battle as { prompt_experience_version?: number })
    .prompt_experience_version;
  delete (mockRealtime.rounds[0] as { situation_snapshot?: unknown })
    .situation_snapshot;
});

test.each([true])(
  'v2 screen-reader confirmation submits the exact build without typing (screen reader %s)',
  async (screenReaderEnabled) => {
    const previousDraft = mockDraft.draft;
    mockDraft.draft = null as never;
    Object.assign(mockRealtime.battle, { prompt_experience_version: 2 });
    Object.assign(mockRealtime.rounds[0], {
      situation_snapshot: {
        id: 'storm-1',
        catalogVersion: 1,
        environmentId: 'storm-citadel',
        text: 'A bridge shakes above a courtyard.',
      },
    });
    const submitPrompt = jest.mocked(mockSubmitPrompt);
    submitPrompt.mockReset().mockResolvedValue({ success: false, status: 500 });
    const choices = getFallbackMoveSuggestions({
      moveType: 'attack',
      situation: { id: 'storm-1', catalogVersion: 1 } as SituationSnapshot,
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await openWorkspace({ screenReaderEnabled });
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: choices[2].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', { name: choices[2].intentHints![2].text }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', {
        name: choices[2].intentHints![2].approachHints![0].text,
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    const lockIn = screen.getByTestId('battle-lock-in');
    fireEvent(lockIn, 'pressIn');
    fireEvent(lockIn, 'pressOut');
    expect(submitPrompt).not.toHaveBeenCalled();
    fireEvent.press(lockIn);
    expect(screen.getByText('Lock in this move?')).toBeTruthy();
    expect(
      screen.getByText(
        `${choices[2].action} ${choices[2].intentHints![2].text} ${choices[2].intentHints![2].approachHints![0].text}`,
      ),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(submitPrompt).not.toHaveBeenCalled();
    fireEvent.press(lockIn);
    const confirm = screen.getByRole('button', { name: 'Lock in' });
    await act(async () => {
      fireEvent.press(confirm);
      fireEvent.press(confirm);
    });
    expect(submitPrompt).toHaveBeenCalledTimes(1);
    expect(submitPrompt).toHaveBeenCalledWith(
      'battle-one',
      'attack',
      `${choices[2].action} ${choices[2].intentHints![2].text} ${choices[2].intentHints![2].approachHints![0].text}`,
      1,
      'builder',
    );
    expect(
      screen.getByTestId('battle-prompt-editor', {
        includeHiddenElements: true,
      }).props.value,
    ).toBe(
      `${choices[2].action} ${choices[2].intentHints![2].text} ${choices[2].intentHints![2].approachHints![0].text}`,
    );
    expect(screen.queryByText(/HOLD/)).toBeNull();
    expect(screen.getByText('TRY AGAIN')).toBeTruthy();
    screen.unmount();
    mockDraft.draft = previousDraft;
    delete (mockRealtime.battle as { prompt_experience_version?: number })
      .prompt_experience_version;
    delete (mockRealtime.rounds[0] as { situation_snapshot?: unknown })
      .situation_snapshot;
  },
);

test('restoring before the round snapshot arrives preserves complete choices', async () => {
  const previousDraft = mockDraft.draft;
  const scene: SituationSnapshot = {
    id: 'storm-1',
    catalogVersion: 1,
    environmentId: 'storm-citadel',
    text: 'A bridge shakes above a courtyard.',
  };
  const options = getFallbackMoveSuggestions({
    moveType: 'attack',
    situation: scene,
  });
  let restoredState = composerReducer(createComposerState(), {
    type: 'change',
    change: {
      type: 'action',
      id: options[0].id!,
      text: options[0].action!,
      moveType: 'attack',
      intentHints: options[0].intentHints,
    },
  });
  restoredState = composerReducer(restoredState, {
    type: 'change',
    change: { type: 'intent', ...options[0].intentHints![0] },
  });
  restoredState = composerReducer(restoredState, {
    type: 'change',
    change: {
      type: 'approach',
      ...options[0].intentHints![0].approachHints![0],
    },
  });
  restoredState = composerReducer(restoredState, {
    type: 'context',
    contextKey: '1:storm-1',
  });
  const text = restoredState.finalText;
  Object.assign(mockRealtime.battle, { prompt_experience_version: 2 });
  mockDraft.draft = {
    text,
    move: 'attack',
    editMode: false,
    composer: composerDraftSnapshot(restoredState),
    composerStep: 'review',
  } as never;
  const screen = await openWorkspace();
  expect(
    screen.getByTestId('battle-lock-in').props.accessibilityState.disabled,
  ).toBe(true);
  Object.assign(mockRealtime.rounds[0], { situation_snapshot: scene });
  screen.rerender(<PromptEntryScreen />);
  await waitFor(() =>
    expect(
      within(screen.getByTestId('composer-review')).getByText(
        options[0].action!,
      ),
    ).toBeTruthy(),
  );
  expect(screen.queryByRole('button', { name: 'Change action' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  expect(
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true })
      .props.value,
  ).toBe(text);
  screen.unmount();
  mockDraft.draft = previousDraft;
  delete (mockRealtime.battle as { prompt_experience_version?: number })
    .prompt_experience_version;
  delete (mockRealtime.rounds[0] as { situation_snapshot?: unknown })
    .situation_snapshot;
});

describe('four-view composer', () => {
  const scene = {
    id: 'storm-1',
    catalogVersion: 1,
    environmentId: 'storm-citadel',
    text: 'A bridge creaks between two towers while wind pushes loose boards toward the edge.',
  } as SituationSnapshot;
  const actions = getFallbackMoveSuggestions({
    moveType: 'attack',
    situation: scene,
  });
  const editor = (screen: ReturnType<typeof render>) =>
    screen.getByTestId('battle-prompt-editor', { includeHiddenElements: true });
  beforeEach(() => {
    mockPresentationActive = true;
    mockParams.round = '1';
    Object.assign(mockDraft, { error: null });
    mockDraft.draft = null as never;
    mockDraft.clear.mockReset().mockResolvedValue(true);
    mockDraft.retry.mockReset().mockResolvedValue(true);
    Object.assign(mockRealtime.battle, { prompt_experience_version: 2 });
    Object.assign(mockRealtime.rounds[0], { situation_snapshot: scene });
    mockRealtime.battle.status = 'waiting_prompts';
    mockRealtime.battle.current_round = 1;
    mockRealtime.rounds[0].status = 'waiting_prompts';
    jest
      .mocked(mockSubmitPrompt)
      .mockReset()
      .mockResolvedValue({ success: false, status: 500 });
  });
  afterEach(() => {
    mockPresentationActive = true;
    mockParams.round = '1';
    Object.assign(mockDraft, { error: null });
    mockDraft.retry.mockReset().mockResolvedValue(true);
    mockDraft.draft = {
      text: mockDraftText,
      move: 'attack',
      editMode: true,
    } as never;
    delete (mockRealtime.battle as { prompt_experience_version?: number })
      .prompt_experience_version;
    delete (mockRealtime.rounds[0] as { situation_snapshot?: unknown })
      .situation_snapshot;
    mockRealtime.battle.status = 'waiting_prompts';
    mockRealtime.battle.current_round = 1;
    mockRealtime.rounds[0].status = 'waiting_prompts';
    jest.useRealTimers();
  });
  test('Face-off keeps mode selection separate from the explicit type and three actions', async () => {
    const screen = await openWorkspace();
    expect(screen.getByRole('button', { name: 'Build move' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Attack' })).toBeNull();
    expect(screen.queryByRole('radio', { name: actions[0].action })).toBeNull();
    expect(screen.getByText(scene.text)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('radio', { name: 'Attack' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: actions[0].action })).toBeNull();
    fireEvent.press(screen.getByRole('radio', { name: 'Attack' }));
    expect(screen.getByRole('radio', { name: actions[0].action })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Build move' })).toBeNull();
    expect(screen.queryByText('AI idea')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Build move' })).toBeTruthy();
    screen.unmount();
  });
  test('a legacy draft without readable builder data keeps its exact text in freestyle', async () => {
    mockDraft.draft = { text: mockDraftText, move: 'defense', editMode: false };
    const screen = await openWorkspace();
    expect(screen.getByTestId('battle-prompt-editor').props.value).toBe(
      mockDraftText,
    );
    expect(
      screen.getByRole('radio', { name: 'Defense' }).props.accessibilityState
        .selected,
    ).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('button', { name: 'Build move' }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Attack' }));
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: actions[0].action }),
      ).toBeTruthy(),
    );
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('button', { name: 'Write your own' }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('battle-prompt-editor').props.value).toBe(
      mockDraftText,
    );
    expect(
      screen.getByRole('radio', { name: 'Defense' }).props.accessibilityState
        .selected,
    ).toBe(true);
    screen.unmount();
  });
  async function buildReview(screen: ReturnType<typeof render>) {
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', { name: actions[0].intentHints![0].text }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', {
        name: actions[0].intentHints![0].approachHints![0].text,
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  }
  test('migrated earlier drafts can be restored without losing the current freestyle version', async () => {
    const earlier =
      'I wait beside the archway and protect the path through the storm.';
    mockDraft.draft = {
      text: mockDraftText,
      move: 'attack',
      editMode: true,
      composerStep: 'write',
      composer: {
        ...composerDraftSnapshot(createComposerState('write')),
        finalText: mockDraftText,
        moveType: 'attack',
        detached: true,
        recoveredManualBuffer: {
          finalText: earlier,
          moveType: 'defense',
          authoringOrigin: 'manual',
        },
      },
    } as never;
    const screen = await openWorkspace();
    expect(screen.getByText('Earlier drafts')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Use saved text' }));
    expect(editor(screen).props.value).toBe(earlier);
    expect(
      screen.getByRole('radio', { name: 'Defense' }).props.accessibilityState
        .selected,
    ).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Use saved text' }));
    expect(editor(screen).props.value).toBe(mockDraftText);
    expect(
      screen.getByRole('radio', { name: 'Attack' }).props.accessibilityState
        .selected,
    ).toBe(true);
    screen.unmount();
  });
  test('refreshed intentions and approaches appear immediately without changing the selected move', async () => {
    const api = jest.mocked(rerollMoveStepSuggestions);
    const paidIntents = [1, 2, 3].map((i) => ({
      id: `paid-i${i}`,
      text: `to establish a clear opening ${i}`,
      approachHints: [1, 2, 3].map((j) => ({
        id: `paid-i${i}-a${j}`,
        text: `by waiting for a balanced moment ${j}`,
      })),
    }));
    api
      .mockReset()
      .mockResolvedValueOnce({
        status: 'ready',
        operationId: 'paid-i',
        contextKey: 'ctx',
        target: 'intent',
        creditsSpent: 1,
        refunded: false,
        intentHints: paidIntents,
      })
      .mockResolvedValueOnce({
        status: 'ready',
        operationId: 'paid-a',
        contextKey: 'ctx-a',
        target: 'approach',
        creditsSpent: 1,
        refunded: false,
        approachHints: [1, 2, 3].map((i) => ({
          id: `final-a${i}`,
          text: `by stepping along the stable boards ${i}`,
        })),
      });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await openWorkspace();
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', { name: actions[0].intentHints![0].text }),
    );
    const before = editor(screen).props.value;
    fireEvent.press(screen.getByRole('button', { name: /3 new intentions/ }));
    expect(api).not.toHaveBeenCalled();
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: paidIntents[1].text }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Use new ideas' })).toBeNull();
    expect(editor(screen).props.value).toBe(before);
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'intent',
        actionText: actions[0].action,
        expectedCredits: 1,
      }),
    );
    expect(editor(screen).props.value).toBe(before);
    fireEvent.press(screen.getByRole('radio', { name: paidIntents[1].text }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.press(
      screen.getByRole('radio', { name: paidIntents[1].approachHints[0].text }),
    );
    const beforeApproach = editor(screen).props.value;
    fireEvent.press(screen.getByRole('button', { name: /3 new approaches/ }));
    await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: 'approach',
        actionText: actions[0].action,
        intentText: paidIntents[1].text,
        expectedCredits: 1,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('radio', {
          name: 'by stepping along the stable boards 2',
        }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Use new ideas' })).toBeNull();
    expect(editor(screen).props.value).toBe(beforeApproach);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.press(
      screen.getByRole('radio', {
        name: 'by stepping along the stable boards 2',
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    const review = within(screen.getByTestId('composer-review'));
    expect(review.getByText(actions[0].action!)).toBeTruthy();
    expect(review.getByText(paidIntents[1].text)).toBeTruthy();
    expect(
      review.getByText('by stepping along the stable boards 2'),
    ).toBeTruthy();
    expect(editor(screen).props.value).toBe(
      `${actions[0].action} ${paidIntents[1].text} by stepping along the stable boards 2`,
    );
    expect(completeMoveSuggestion).not.toHaveBeenCalled();
    screen.unmount();
  });
  test.each([0, 1])(
    'refreshed actions replace choices immediately at a cost of %s, preserving the selected move',
    async (credits) => {
      mockRerollCredits = credits;
      const api = jest.mocked(generateMoveSuggestions);
      api.mockReset().mockResolvedValueOnce({
        status: 'ready',
        failure: null,
        message: null,
        set: {
          id: 'rerolled-bank',
          isPaid: credits > 0,
          creditsSpent: credits,
          suggestions: actions.map((action, index) => ({
            ...action,
            id: `rerolled-${index}`,
            action: `I secure the loose board beside tower ${index + 1}`,
          })),
        },
      });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const screen = await openWorkspace();
      enterBuilderAction(screen);
      fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
      const before = editor(screen).props.value;
      fireEvent.press(screen.getByRole('button', { name: /3 new actions/ }));
      await act(async () => alert.mock.calls.at(-1)![2]![1].onPress!());
      await waitFor(() =>
        expect(
          screen.getByRole('radio', {
            name: 'I secure the loose board beside tower 2',
          }),
        ).toBeTruthy(),
      );
      expect(
        screen.queryByRole('button', { name: 'Use new ideas' }),
      ).toBeNull();
      expect(
        screen.queryByRole('radio', { name: actions[0].action }),
      ).toBeNull();
      expect(editor(screen).props.value).toBe(before);
      expect(screen.getByText('Current selection')).toBeTruthy();
      fireEvent.press(
        screen.getByRole('radio', {
          name: 'I secure the loose board beside tower 2',
        }),
      );
      expect(editor(screen).props.value).toBe(
        'I secure the loose board beside tower 2',
      );
      expect(api).toHaveBeenCalledWith(
        'battle-one',
        'attack',
        1,
        expect.objectContaining({
          operation: 'reroll',
          expectedCredits: credits,
        }),
      );
      screen.unmount();
    },
  );
  test('a delayed intention refresh appears only in its original branch on return', async () => {
    const api = jest.mocked(rerollMoveStepSuggestions);
    let deliver!: (
      value: Awaited<ReturnType<typeof rerollMoveStepSuggestions>>,
    ) => void;
    api.mockReset().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await openWorkspace();
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', { name: actions[0].intentHints![0].text }),
    );
    const originalMove = editor(screen).props.value;
    fireEvent.press(screen.getByRole('button', { name: /3 new intentions/ }));
    act(() => alert.mock.calls.at(-1)![2]![1].onPress!());
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('radio', { name: actions[1].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    const otherMove = editor(screen).props.value;
    const newHints = [1, 2, 3].map((i) => ({
      id: `delayed-i${i}`,
      text: `to protect the exposed doorway ${i}`,
      approachHints: actions[0].intentHints![0].approachHints,
    }));
    await act(async () =>
      deliver({
        status: 'ready',
        operationId: 'delayed',
        contextKey: 'first-action',
        target: 'intent',
        creditsSpent: 1,
        refunded: false,
        intentHints: newHints,
      }),
    );
    expect(screen.queryByRole('radio', { name: newHints[0].text })).toBeNull();
    expect(editor(screen).props.value).toBe(otherMove);
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: newHints[0].text }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Use new ideas' })).toBeNull();
    expect(editor(screen).props.value).toBe(originalMove);
    expect(api).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
  test('a purchase confirmation from another step cannot spend a credit', async () => {
    jest.mocked(rerollMoveStepSuggestions).mockReset();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await openWorkspace();
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(screen.getByRole('button', { name: /3 new intentions/ }));
    const stale = alert.mock.calls.at(-1)![2]![1].onPress!;
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await act(async () => stale());
    expect(rerollMoveStepSuggestions).not.toHaveBeenCalled();
    screen.unmount();
  });
  test('selection stays on its question and review is explicit; no filters or draft chrome', async () => {
    const screen = await openWorkspace();
    const mountedEditor = editor(screen);
    expect(screen.queryByText('All ideas')).toBeNull();
    expect(screen.queryByText('Draft saved on this device')).toBeNull();
    expect(screen.queryByText('Discard draft')).toBeNull();
    expect(screen.queryByTestId('battle-lock-in')).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    enterBuilderAction(screen);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(
      screen.queryByRole('radio', { name: actions[0].intentHints![0].text }),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('What are you trying to achieve?')).toBeTruthy();
    fireEvent.press(
      screen.getByRole('radio', { name: actions[0].intentHints![0].text }),
    );
    expect(screen.queryByTestId('battle-lock-in')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('How will you make it work?')).toBeTruthy();
    expect(screen.getByText(scene.text)).toBeTruthy();
    fireEvent.press(
      screen.getByRole('radio', {
        name: actions[0].intentHints![0].approachHints![0].text,
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('HOLD TO LOCK IN')).toBeTruthy();
    const review = within(screen.getByTestId('composer-review'));
    for (const label of ['Action', 'Intention', 'Approach']) {
      expect(review.getByRole('header', { name: label })).toBeTruthy();
    }
    expect(review.getByText(actions[0].action!)).toBeTruthy();
    expect(review.getByText(actions[0].intentHints![0].text)).toBeTruthy();
    expect(
      review.getByText(actions[0].intentHints![0].approachHints![0].text),
    ).toBeTruthy();
    expect(editor(screen).props.value).toBe(
      `${actions[0].action} ${actions[0].intentHints![0].text} ${actions[0].intentHints![0].approachHints![0].text}`,
    );
    expect(editor(screen)).toBe(mountedEditor);
    expect(
      screen.queryByRole('button', { name: 'Change intention' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Undo builder changes' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit full text' })).toBeNull();
    expect(screen.getByText(scene.text)).toBeTruthy();
    screen.unmount();
  });
  test('AI waiting keeps writing available without a starter shortcut', async () => {
    const read = jest.mocked(getMoveSuggestions);
    const oldRead = read.getMockImplementation();
    read.mockImplementation(async () => ({ status: 'pending' }));
    jest.useFakeTimers();
    const screen = await openWorkspace();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Write your own prompt' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Use starter ideas' }),
    ).toBeNull();
    await act(async () => jest.advanceTimersByTime(8000));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText('Preparing actions…')).toBeNull();
    enterBuilderAction(screen);
    expect(
      screen.queryByRole('button', { name: 'Use starter ideas' }),
    ).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(
      screen.getByRole('progressbar', {
        name: 'Preparing actions. This may take a few seconds.',
      }).props.accessibilityState.busy,
    ).toBe(true);
    expect(screen.getByText('This may take a few seconds.')).toBeTruthy();
    expect(screen.getByText(scene.text)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    enterManualWriting(screen);
    expect(editor(screen).props.editable).toBe(true);
    screen.unmount();
    read.mockImplementation(oldRead!);
    jest.useRealTimers();
  });
  test.each(['build', 'write'])(
    'a legacy AI bank applies its free extension automatically after delivery in %s mode',
    async (mode) => {
      const read = jest.mocked(getMoveSuggestions);
      const generate = jest.mocked(generateMoveSuggestions);
      const oldRead = read.getMockImplementation();
      const oldGenerate = generate.getMockImplementation();
      jest.mocked(completeMoveSuggestion).mockClear();
      read.mockImplementation(async (_battle, moveType) => ({
        status: 'ready',
        id: `old-${moveType}`,
        isPaid: true,
        suggestions: getFallbackMoveSuggestions({
          moveType,
          situation: scene,
        }).map((option) => ({
          ...option,
          id: `ai:${option.id}`,
          compositionVersion: undefined,
          intentHints: option.intentHints!.map(({ id, text }) => ({
            id,
            text,
          })),
        })),
      }));
      let deliverAttack!: (
        result: Awaited<ReturnType<typeof generateMoveSuggestions>>,
      ) => void;
      generate.mockImplementation((_battle, moveType) =>
        moveType === 'attack'
          ? new Promise((resolve) => {
              deliverAttack = resolve;
            })
          : Promise.resolve({
              status: 'pending',
              compositionStatus: 'pending',
              set: null,
              failure: null,
              message: null,
            }),
      );
      const screen = await openWorkspace();
      enterBuilderAction(screen);
      fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      fireEvent.press(
        screen.getByRole('radio', { name: actions[0].intentHints![0].text }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      expect(screen.getByText('How will you make it work?')).toBeTruthy();
      expect(screen.queryByLabelText('Your approach')).toBeNull();
      expect(
        screen.getByText('Preparing approaches for this set…'),
      ).toBeTruthy();
      expect(completeMoveSuggestion).not.toHaveBeenCalled();
      expect(generate).toHaveBeenCalledWith('battle-one', 'attack', 1, {
        operation: 'ensure_free',
        compositionVersion: 3,
        suggestionSetId: 'old-attack',
      });
      const selectedText = editor(screen).props.value;
      const ownText =
        'I shield the bridge entrance while keeping an escape route open.';
      if (mode === 'write') {
        for (let i = 0; i < 3; i++)
          fireEvent.press(screen.getByRole('button', { name: 'Back' }));
        enterManualWriting(screen);
        fireEvent.changeText(editor(screen), ownText);
      }
      await act(async () =>
        deliverAttack({
          status: 'ready',
          compositionStatus: 'ready',
          failure: null,
          message: null,
          set: {
            id: 'old-attack',
            isPaid: true,
            creditsSpent: 0,
            suggestions: actions.map((option) => ({
              ...option,
              id: `ai:${option.id}`,
            })),
          },
        }),
      );
      if (mode === 'write') {
        expect(editor(screen).props.value).toBe(ownText);
        fireEvent.press(screen.getByRole('button', { name: 'Back' }));
        fireEvent.press(screen.getByRole('button', { name: 'Build move' }));
        for (let i = 0; i < 3; i++)
          fireEvent.press(screen.getByRole('button', { name: 'Next' }));
      }
      await waitFor(() =>
        expect(
          screen.getByRole('radio', {
            name: actions[0].intentHints![0].approachHints![0].text,
          }),
        ).toBeTruthy(),
      );
      expect(
        screen.queryByRole('button', { name: 'Use new ideas' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Use updated set' }),
      ).toBeNull();
      expect(editor(screen).props.value).toBe(selectedText);
      expect(completeMoveSuggestion).not.toHaveBeenCalled();
      screen.unmount();
      read.mockImplementation(oldRead!);
      generate.mockImplementation(oldGenerate!);
    },
  );
  test('Back revisits an earlier complete branch with its original type without Undo or rewriting', async () => {
    const screen = await openWorkspace();
    await buildReview(screen);
    const original = editor(screen).props.value;
    for (let i = 0; i < 3; i++)
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    const other = getFallbackMoveSuggestions({
      moveType: 'defense',
      situation: scene,
    })[1];
    enterBuilderAction(screen, 'Defense');
    fireEvent.press(screen.getByRole('radio', { name: other.action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('button', { name: 'Next' }).props.accessibilityState
        .disabled,
    ).toBe(true);
    fireEvent.press(
      screen.getByRole('radio', { name: other.intentHints![1].text }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    fireEvent.press(
      screen.getByRole('radio', {
        name: other.intentHints![1].approachHints![1].text,
      }),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      within(screen.getByTestId('composer-review')).getByText('Defense'),
    ).toBeTruthy();
    for (let i = 0; i < 3; i++)
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    enterBuilderAction(screen);
    fireEvent.press(screen.getByRole('radio', { name: actions[0].action }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('radio', { name: actions[0].intentHints![0].text }).props
        .accessibilityState.selected,
    ).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('radio', {
        name: actions[0].intentHints![0].approachHints![0].text,
      }).props.accessibilityState.selected,
    ).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(editor(screen).props.value).toBe(original);
    expect(
      within(screen.getByTestId('composer-review')).getByText('Attack'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Undo builder changes' }),
    ).toBeNull();
    expect(ensureFreeMoveSuggestionBanks).not.toHaveBeenCalled();
    screen.unmount();
  });
  test('write, review and edit retain one native editor and atomic prompt/type', async () => {
    const screen = await openWorkspace();
    const mountedEditor = editor(screen);
    enterManualWriting(screen);
    const prose =
      'I brace the bridge supports to keep a safe escape route open.';
    fireEvent.changeText(mountedEditor, prose);
    fireEvent.press(screen.getByRole('radio', { name: 'Defense' }));
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(prose)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Change intention' }),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(editor(screen)).toBe(mountedEditor);
    expect(mountedEditor.props.value).toBe(prose);
    await waitFor(() =>
      expect(mockDraft.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: prose,
          move: 'defense',
          composerStep: 'write',
        }),
      ),
    );
    screen.unmount();
  });
  test('completed hold submits once without a modal; early release preserves the move', async () => {
    const screen = await openWorkspace();
    await buildReview(screen);
    jest.useFakeTimers();
    const lock = screen.getByTestId('battle-lock-in');
    fireEvent(lock, 'pressIn');
    act(() => jest.advanceTimersByTime(599));
    fireEvent(lock, 'pressOut');
    act(() => jest.advanceTimersByTime(1000));
    expect(mockSubmitPrompt).not.toHaveBeenCalled();
    fireEvent(lock, 'pressIn');
    fireEvent(lock, 'pressIn');
    await act(async () => jest.advanceTimersByTime(600));
    expect(mockSubmitPrompt).toHaveBeenCalledTimes(1);
    expect(mockSubmitPrompt).toHaveBeenCalledWith(
      'battle-one',
      'attack',
      `${actions[0].action} ${actions[0].intentHints![0].text} ${actions[0].intentHints![0].approachHints![0].text}`,
      1,
      'builder',
    );
    expect(screen.queryByText('Lock in this move?')).toBeNull();
    screen.unmount();
  });
  test.each(['battle', 'round', 'advance'] as const)(
    'closed %s cancels a hold even while draft cleanup fails',
    async (closed) => {
      mockDraft.clear.mockResolvedValueOnce(false);
      const screen = await openWorkspace();
      await buildReview(screen);
      jest.useFakeTimers();
      fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
      act(() => jest.advanceTimersByTime(300));
      if (closed === 'battle') mockRealtime.battle.status = 'completed';
      if (closed === 'round') mockRealtime.rounds[0].status = 'resolving';
      if (closed === 'advance') mockRealtime.battle.current_round = 2;
      screen.rerender(<PromptEntryScreen />);
      await act(async () => jest.advanceTimersByTime(600));
      expect(mockSubmitPrompt).not.toHaveBeenCalled();
      expect(
        screen.getByTestId('battle-lock-in').props.accessibilityState.disabled,
      ).toBe(true);
      screen.unmount();
    },
  );
  test('hardware Back returns a stage and cancels an active hold', async () => {
    let back = () => false;
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((event, handler) => {
        back = handler as () => boolean;
        return { remove: jest.fn() };
      });
    const screen = await openWorkspace();
    await buildReview(screen);
    jest.useFakeTimers();
    fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
    act(() => {
      jest.advanceTimersByTime(300);
      back();
    });
    await act(async () => jest.advanceTimersByTime(600));
    expect(screen.getByText('How will you make it work?')).toBeTruthy();
    expect(mockSubmitPrompt).not.toHaveBeenCalled();
    screen.unmount();
  });
  test.each([
    'background',
    'deadline',
    'reader',
    'edit',
    'type',
    'scope',
  ] as const)(
    '%s invalidates the hold snapshot before its timer fires',
    async (change) => {
      let readerChanged = (_value: boolean) => {};
      jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
        event: string,
        handler: unknown,
      ) => {
        if (event === 'screenReaderChanged')
          readerChanged = handler as (value: boolean) => void;
        return { remove: jest.fn() };
      }) as never);
      const screen = await openWorkspace();
      await buildReview(screen);
      jest.useFakeTimers();
      fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
      act(() => jest.advanceTimersByTime(300));
      if (change === 'background') mockPresentationActive = false;
      if (change === 'deadline')
        mockRealtime.rounds[0].lock_in_deadline = new Date(
          Date.now() + 100,
        ).toISOString();
      if (change === 'reader') act(() => readerChanged(true));
      if (change === 'edit' || change === 'type') {
        for (let i = 0; i < 3; i++)
          fireEvent.press(screen.getByRole('button', { name: 'Back' }));
        enterManualWriting(screen);
        if (change === 'edit')
          fireEvent.changeText(
            editor(screen),
            'I secure the bridge with a new plan that keeps every support steady.',
          );
        else fireEvent.press(screen.getByRole('radio', { name: 'Defense' }));
      }
      if (change === 'scope') mockParams.round = '2';
      screen.rerender(<PromptEntryScreen />);
      await act(async () => jest.advanceTimersByTime(600));
      expect(mockSubmitPrompt).not.toHaveBeenCalled();
      screen.unmount();
      mockParams.round = '1';
      mockRealtime.rounds[0].lock_in_deadline = '2099-09-15T22:00:00Z';
    },
  );
  test('an old screen-reader confirmation cannot submit after editing and returning to review', async () => {
    const screen = await openWorkspace({ screenReaderEnabled: true });
    await buildReview(screen);
    fireEvent.press(screen.getByTestId('battle-lock-in'));
    const staleConfirm = screen.UNSAFE_getByType(PromptLockConfirmation).props
      .onConfirm;
    fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    for (let i = 0; i < 3; i++)
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    enterManualWriting(screen);
    fireEvent.changeText(
      editor(screen),
      'I guide the loose bridge boards into a safe path through the storm.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    await act(async () => staleConfirm());
    expect(mockSubmitPrompt).not.toHaveBeenCalled();
    screen.unmount();
  });
  test('a cancelled screen-reader confirmation cannot submit without a new confirmation', async () => {
    const screen = await openWorkspace({ screenReaderEnabled: true });
    await buildReview(screen);
    fireEvent.press(screen.getByTestId('battle-lock-in'));
    const staleConfirm = screen.UNSAFE_getByType(PromptLockConfirmation).props
      .onConfirm;
    fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    await act(async () => staleConfirm());
    expect(mockSubmitPrompt).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('battle-lock-in'));
    await act(async () => staleConfirm());
    expect(mockSubmitPrompt).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.press(screen.getByRole('button', { name: 'Lock in' })),
    );
    expect(mockSubmitPrompt).toHaveBeenCalledTimes(1);
    screen.unmount();
  });
  test('a late native type event cannot mutate a submission in flight', async () => {
    let finish!: (value: { success: boolean; status: number }) => void;
    jest.mocked(mockSubmitPrompt).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const screen = await openWorkspace();
    enterManualWriting(screen);
    fireEvent.changeText(
      editor(screen),
      'I brace the bridge supports to keep a safe escape route open.',
    );
    fireEvent.press(screen.getByRole('radio', { name: 'Defense' }));
    const staleTypeEvent = screen.UNSAFE_getByType(ComposerMoveTypeControl)
      .props.onChange;
    fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    jest.useFakeTimers();
    fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
    await act(async () => jest.advanceTimersByTime(600));
    act(() => staleTypeEvent('finisher'));
    expect(
      within(screen.getByTestId('composer-review')).getByText('Defense'),
    ).toBeTruthy();
    await act(async () => finish({ success: false, status: 500 }));
    screen.unmount();
  });
  test('changing accessibility mode invalidates an old confirmation', async () => {
    let readerChanged = (_value: boolean) => {};
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      event: string,
      handler: unknown,
    ) => {
      if (event === 'screenReaderChanged')
        readerChanged = handler as (value: boolean) => void;
      return { remove: jest.fn() };
    }) as never);
    const screen = await openWorkspace({ screenReaderEnabled: true });
    await buildReview(screen);
    fireEvent.press(screen.getByTestId('battle-lock-in'));
    const staleConfirm = screen.UNSAFE_getByType(PromptLockConfirmation).props
      .onConfirm;
    act(() => readerChanged(false));
    await act(async () => staleConfirm());
    expect(mockSubmitPrompt).not.toHaveBeenCalled();
    screen.unmount();
  });
  test('an old closed-submit alert cannot clear or navigate a different scope', async () => {
    jest
      .mocked(mockSubmitPrompt)
      .mockResolvedValue({ success: false, status: 409, code: 'round_closed' });
    const alerts = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await openWorkspace();
    await buildReview(screen);
    jest.useFakeTimers();
    fireEvent(screen.getByTestId('battle-lock-in'), 'pressIn');
    await act(async () => jest.advanceTimersByTime(600));
    const oldOK = alerts.mock.calls.find(
      (call) => call[2]?.[0]?.text === 'OK',
    )?.[2]?.[0].onPress;
    expect(oldOK).toBeDefined();
    mockParams.round = '2';
    screen.rerender(<PromptEntryScreen />);
    mockDraft.clear.mockClear();
    mockLeave.exitTo.mockClear();
    await act(async () => oldOK?.());
    expect(mockDraft.clear).not.toHaveBeenCalled();
    expect(mockLeave.exitTo).not.toHaveBeenCalled();
    screen.unmount();
    mockParams.round = '1';
  });
  test('late cleanup of a closed round cannot navigate a different scope', async () => {
    let finish!: (deleted: boolean) => void;
    mockDraft.clear.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mockLeave.exitTo.mockClear();
    const screen = await openWorkspace();
    const oldRounds = mockRealtime.rounds;
    mockRealtime.rounds = [{ ...oldRounds[0], status: 'resolving' }];
    screen.rerender(<PromptEntryScreen />);
    mockParams.round = '2';
    mockRealtime.battle.current_round = 2;
    mockRealtime.rounds.push({
      ...mockRealtime.rounds[0],
      round_number: 2,
      status: 'waiting_prompts',
    });
    screen.rerender(<PromptEntryScreen />);
    await act(async () => finish(true));
    expect(mockLeave.exitTo).not.toHaveBeenCalled();
    screen.unmount();
    mockParams.round = '1';
    mockRealtime.rounds = oldRounds;
  });
  test.each(['before retry', 'during retry'] as const)(
    'an old storage-retry callback cannot redirect a new round %s',
    async (change) => {
      let finish!: (saved: boolean) => void;
      mockDraft.retry.mockReset().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      mockDraft.clear.mockResolvedValue(false);
      const screen = await openWorkspace();
      Object.assign(mockDraft, { error: 'Draft storage failed' });
      mockRealtime.battle.status = 'completed';
      screen.rerender(<PromptEntryScreen />);
      let retryNode = screen.getByText('Retry draft storage');
      while (typeof retryNode.props.onPress !== 'function' && retryNode.parent)
        retryNode = retryNode.parent;
      const retry = retryNode.props.onPress;
      let pending: Promise<void> | undefined;
      if (change === 'during retry') pending = retry();
      mockParams.round = '2';
      screen.rerender(<PromptEntryScreen />);
      mockLeave.exitTo.mockClear();
      if (change === 'before retry') pending = retry();
      await act(async () => {
        finish?.(true);
        await pending;
      });
      expect(mockLeave.exitTo).not.toHaveBeenCalled();
      if (change === 'before retry')
        expect(mockDraft.retry).not.toHaveBeenCalled();
      screen.unmount();
      mockParams.round = '1';
      Object.assign(mockDraft, { error: null });
      mockDraft.retry.mockReset().mockResolvedValue(true);
    },
  );
});
