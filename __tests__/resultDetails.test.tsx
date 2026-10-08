import React from 'react';
import * as RN from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ResultDetails, {
  type ResultDetailsProps,
} from '@/components/battle/ResultDetails';
import type { BattleRound } from '@/types/battle';
import ResultInfoSheet from '@/components/battle/ResultInfoSheet';

jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));

const playedRound: BattleRound = {
  id: 'round-1',
  battle_id: 'battle-1',
  round_number: 1,
  status: 'result_ready',
  lock_in_deadline: null,
  player_one_locked_at: null,
  player_two_locked_at: null,
  both_locked_at: null,
  round_winner_id: 'p1',
  is_draw: false,
  is_ko: false,
  player_one_score: 43.5,
  player_two_score: 31.2,
  score_gap: 12.3,
  player_one_damage: 29,
  player_two_damage: 0,
  player_one_hp_after: 91,
  player_two_hp_after: 52,
  judge_payload: null,
  judge_prompt_version: null,
  judge_model_id: null,
  stat_modifier_player_one: null,
  stat_modifier_player_two: null,
  move_type_modifier_player_one: null,
  move_type_modifier_player_two: null,
  created_at: '',
  updated_at: '',
  resolved_at: null,
};

function props(
  overrides: Partial<ResultDetailsProps> = {},
): ResultDetailsProps {
  return {
    theme: 'The calm before the storm',
    isBo3: true,
    rounds: [playedRound],
    myProfileId: 'p1',
    playerOneId: 'p1',
    noContest: false,
    info: {
      rewards: {
        state: 'ready',
        title: 'Progress',
        feedback: null,
        items: [],
        details: [
          {
            kind: 'quests',
            label: 'Completed in this battle',
            value: 'Finisher Focus',
          },
        ],
        hasQuestActivity: true,
        correctionLine: null,
      },
      decisionExplanation: 'Decided by round majority · You 2 · Opponent 0.',
      judgeLine: 'A precise response with a strong character voice.',
      matchupNote: null,
      judgeNotesHistorical: false,
    },
    onViewQuests: jest.fn(),
    ...overrides,
  };
}

afterEach(() => jest.restoreAllMocks());

test('shows theme and round numbers immediately, with explanations available only in Result info', () => {
  const input = props();
  const screen = render(<ResultDetails {...input} />);
  expect(screen.getByText(input.theme!)).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Round by round' })).toBeTruthy();
  expect(screen.getByText('Round 1 · You won · 43.5 vs 31.2')).toBeTruthy();
  expect(screen.getByText('HP after: 91 vs 52')).toBeTruthy();
  expect(screen.queryByText(input.info.decisionExplanation!)).toBeNull();
  expect(screen.queryByText('Finisher Focus')).toBeNull();
  expect(screen.queryByRole('button', { name: /Battle details/i })).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Result info' }));
  expect(screen.getByRole('header', { name: 'Result info' })).toBeTruthy();
  expect(screen.getByText(input.info.decisionExplanation!)).toBeTruthy();
  expect(screen.getByText('Finisher Focus')).toBeTruthy();
  expect(screen.getByText(input.info.judgeLine!)).toBeTruthy();
});

test('keeps player-two round scores and HP oriented to the viewer', () => {
  const screen = render(<ResultDetails {...props({ myProfileId: 'p2' })} />);
  expect(
    screen.getByText('Round 1 · Opponent won · 31.2 vs 43.5'),
  ).toBeTruthy();
  expect(screen.getByText('HP after: 52 vs 91')).toBeTruthy();
});

test('omits the round list for a legacy single battle', () => {
  const screen = render(<ResultDetails {...props({ isBo3: false })} />);
  expect(screen.queryByText('Round by round')).toBeNull();
  expect(screen.queryByText(/Round 1/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Result info' })).toBeTruthy();
});

test('labels no-contest rounds as history and original judge notes as before review', () => {
  const input = props({ noContest: true });
  input.info = {
    ...input.info,
    decisionExplanation: null,
    judgeNotesHistorical: true,
  };
  const screen = render(<ResultDetails {...input} />);
  expect(screen.getByRole('header', { name: 'Played rounds' })).toBeTruthy();
  expect(screen.getByText(/Shown for reference.*no contest/)).toBeTruthy();
  expect(screen.queryByText('Round by round')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Result info' }));
  expect(screen.getByText('Before review')).toBeTruthy();
  expect(screen.getByText(input.info.judgeLine!)).toBeTruthy();
  expect(screen.queryByText('How the result was decided')).toBeNull();
});

test.each([null, '', '   '])(
  'omits an absent theme (%p) without inventing a title',
  (theme) => {
    const screen = render(<ResultDetails {...props({ theme })} />);
    expect(screen.queryByText('THEME')).toBeNull();
    expect(screen.getByText('Round 1 · You won · 43.5 vs 31.2')).toBeTruthy();
  },
);

test('retains a complete long Unicode theme and unknown round HP', () => {
  const theme = 'Żywioły — 静かな嵐 — A promise beneath the longest winter sky';
  const screen = render(
    <ResultDetails
      {...props({
        theme,
        rounds: [
          {
            ...playedRound,
            player_one_hp_after: null,
            player_two_hp_after: null,
          },
        ],
      })}
    />,
  );
  expect(screen.getByText(theme)).toBeTruthy();
  expect(screen.getByText('HP after: — vs —')).toBeTruthy();
});

test('omits Result info when every explanatory section is empty', () => {
  const input = props();
  input.info = {
    rewards: { ...input.info.rewards, details: [], hasQuestActivity: false },
    decisionExplanation: null,
    judgeLine: null,
    matchupNote: null,
    judgeNotesHistorical: false,
  };
  const screen = render(<ResultDetails {...input} />);
  expect(screen.queryByRole('button', { name: 'Result info' })).toBeNull();
  expect(screen.getByRole('header', { name: 'Round by round' })).toBeTruthy();
});

test('dismissal returns focus to Result info without remounting the round content', () => {
  const focus = jest
    .spyOn(RN.AccessibilityInfo, 'setAccessibilityFocus')
    .mockImplementation(() => {});
  const screen = render(<ResultDetails {...props()} />);
  const rounds = screen.getByRole('header', { name: 'Round by round' });
  // Jest's native View instance has no host tag; supply the native handle at
  // that boundary, as in the shared-sheet focus tests.
  const opener = screen.UNSAFE_getByType(ResultInfoSheet).props.returnFocusRef;
  opener.current = 88;
  fireEvent.press(screen.getByRole('button', { name: 'Result info' }));
  const modal = screen.UNSAFE_getByType(RN.Modal);
  act(() => modal.props.onShow());
  focus.mockClear();
  fireEvent.press(screen.getByRole('button', { name: 'Close result info' }));
  expect(screen.queryByText('Finisher Focus')).toBeNull();
  act(() => modal.props.onDismiss());
  expect(focus).toHaveBeenCalledWith(88);
  expect(screen.getByRole('header', { name: 'Round by round' })).toBe(rounds);
});

test('View quests closes the sheet and waits for dismissal before navigating once', () => {
  const input = props();
  const screen = render(<ResultDetails {...input} />);
  fireEvent.press(screen.getByRole('button', { name: 'Result info' }));
  const modal = screen.UNSAFE_getByType(RN.Modal);
  act(() => modal.props.onShow());
  fireEvent.press(screen.getByRole('button', { name: 'View quests' }));
  expect(screen.queryByText('Finisher Focus')).toBeNull();
  expect(input.onViewQuests).not.toHaveBeenCalled();
  act(() => modal.props.onDismiss());
  expect(input.onViewQuests).toHaveBeenCalledTimes(1);
  act(() => modal.props.onDismiss());
  expect(input.onViewQuests).toHaveBeenCalledTimes(1);
});

test('Android dismissal completion cannot navigate twice if its native callback also arrives', () => {
  jest.replaceProperty(RN.Platform, 'OS', 'android');
  let finishDismissal: (() => void) | undefined;
  jest
    .spyOn(RN.InteractionManager, 'runAfterInteractions')
    .mockImplementation((task) => {
      if (typeof task === 'function') finishDismissal = task;
      return { cancel: jest.fn(), then: jest.fn(), done: jest.fn() } as never;
    });
  const input = props();
  const screen = render(<ResultDetails {...input} />);
  fireEvent.press(screen.getByRole('button', { name: 'Result info' }));
  const modal = screen.UNSAFE_getByType(RN.Modal);
  act(() => modal.props.onShow());
  fireEvent.press(screen.getByRole('button', { name: 'View quests' }));
  expect(input.onViewQuests).not.toHaveBeenCalled();
  act(() => finishDismissal?.());
  act(() => modal.props.onDismiss());
  expect(input.onViewQuests).toHaveBeenCalledTimes(1);
});

test('an open info sheet reflects new adjudication data without retaining the old explanation', () => {
  const input = props();
  const screen = render(<ResultDetails {...input} />);
  fireEvent.press(screen.getByRole('button', { name: 'Result info' }));
  screen.rerender(
    <ResultDetails
      {...input}
      noContest
      info={{
        ...input.info,
        decisionExplanation: null,
        judgeNotesHistorical: true,
        rewards: {
          ...input.info.rewards,
          details: [
            {
              kind: 'correction',
              label: 'Rating correction',
              value:
                'Original rating change was reversed. No replacement rating was awarded.',
            },
          ],
        },
      }}
    />,
  );
  expect(screen.queryByText(input.info.decisionExplanation!)).toBeNull();
  expect(screen.queryByText('Finisher Focus')).toBeNull();
  expect(screen.getByText('Before review')).toBeTruthy();
  expect(screen.getByText(/No replacement rating was awarded/)).toBeTruthy();
});
