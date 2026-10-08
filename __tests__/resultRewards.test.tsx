import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ResultRewards, {
  ResultRewardDetails,
  resultRewardsNode,
} from '@/components/battle/ResultRewards';
import ResultMediaSection from '@/components/battle/ResultMediaSection';
import { GameText } from '@/components/game';
import {
  buildResultRewardsModel,
  type ResultRewardsInput,
} from '@/components/battle/resultRewardsView';
import type { RewardSummary } from '@/types/battle';

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const recordedReward = (
  overrides: Partial<RewardSummary> = {},
): RewardSummary => ({
  credits_granted: 0,
  credit_reasons: [],
  credits_eligible: true,
  win_streak_after: 0,
  best_win_streak: 0,
  streak_milestone: false,
  quests_advanced: [],
  quests_completed: [],
  mode: 'ranked',
  ...overrides,
});

const input = (
  overrides: Partial<ResultRewardsInput> = {},
): ResultRewardsInput => ({
  outcome: 'won',
  isBot: false,
  mode: 'ranked',
  exhibition: false,
  reviewStatus: null,
  rating: { delta: 12, line: 'Rating +12', gated: false },
  reward: recordedReward({ win_streak_after: 2, best_win_streak: 4 }),
  battleCompleted: true,
  ...overrides,
});

beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
});

test('titles earned changes Rewards and losses Progress', () => {
  const earned = buildResultRewardsModel(
    input({ reward: recordedReward({ credits_granted: 3 }) }),
  );
  const loss = buildResultRewardsModel(
    input({
      outcome: 'lost',
      rating: { delta: -9, line: 'Rating −9', gated: false },
      reward: recordedReward({ win_streak_after: 0, best_win_streak: 4 }),
    }),
  );

  expect(earned.title).toBe('Rewards');
  expect(earned.items.map((item) => item.kind)).toEqual(['rating', 'credits']);
  expect(loss.title).toBe('Progress');
  expect(loss.items).toEqual([
    { kind: 'rating', label: 'Rating', tone: 'down', value: '−9' },
    {
      kind: 'streak',
      label: 'Recorded streak',
      tone: 'neutral',
      value: '0',
    },
  ]);
});

test('distinguishes a confirmed zero-change summary from unknown reward state', () => {
  const confirmed = buildResultRewardsModel(
    input({
      outcome: 'draw',
      rating: { delta: 0, line: null, gated: false },
      reward: recordedReward(),
    }),
  );
  const pending = buildResultRewardsModel(
    input({ reward: null, battleCompleted: false }),
  );
  const unavailable = buildResultRewardsModel(
    input({ reward: null, battleCompleted: true }),
  );

  expect(confirmed.state).toBe('empty');
  expect(confirmed.items).toEqual([]);
  expect(pending).toMatchObject({
    state: 'pending',
    feedback: 'Tallying recorded rewards…',
  });
  expect(unavailable).toMatchObject({
    state: 'unavailable',
    feedback: 'Reward summary unavailable for this battle.',
  });
  expect(unavailable.items).toEqual([
    { kind: 'rating', label: 'Rating', tone: 'up', value: '+12' },
  ]);

  expect(render(<ResultRewards model={confirmed} />).toJSON()).toBeNull();
  const pendingUi = render(<ResultRewards model={pending} />);
  expect(pendingUi.getByText('Tallying recorded rewards…')).toBeTruthy();
  expect(pendingUi.queryByText('0')).toBeNull();
});

test('omits the rewards section wrapper for a confirmed empty model', () => {
  const model = buildResultRewardsModel(
    input({
      outcome: 'draw',
      rating: { delta: 0, line: null, gated: false },
      reward: recordedReward(),
    }),
  );
  const ui = render(
    <ResultMediaSection
      showMedia={false}
      media={null}
      actions={<GameText>Actions</GameText>}
      rewards={resultRewardsNode(model)}
    />,
  );

  expect(ui.queryByTestId('result-section-rewards')).toBeNull();
});

test.each([
  ['practice', { isBot: true, mode: 'bot' }],
  ['exhibition', { exhibition: true }],
] as const)('suppresses competitive rating for %s results', (_label, flags) => {
  const model = buildResultRewardsModel(
    input({
      ...flags,
      reward: recordedReward({
        credits_eligible: false,
        win_streak_after: 1,
        best_win_streak: 5,
      }),
    }),
  );

  expect(model.items).toEqual([
    {
      kind: 'streak',
      label: 'Recorded streak',
      tone: 'neutral',
      value: '1',
    },
  ]);
  expect(
    model.details.find((detail) => detail.kind === 'reward-eligibility'),
  ).toBeTruthy();
});

test('keeps rating-gate and diamond eligibility as separate recorded facts', () => {
  const model = buildResultRewardsModel(
    input({
      rating: {
        delta: null,
        line: 'No rating change — both prompts were below the quality floor.',
        gated: true,
      },
      reward: recordedReward({ credits_eligible: true }),
    }),
  );

  expect(model.items.find((item) => item.kind === 'rating')).toBeUndefined();
  expect(model.details).toContainEqual({
    kind: 'rating-eligibility',
    label: 'Rating eligibility',
    value: 'No rating change — both prompts were below the quality floor.',
  });
  expect(model.details).toContainEqual({
    kind: 'reward-eligibility',
    label: 'Diamond eligibility',
    value: 'This battle was eligible for ranked streak diamonds.',
  });
});

test('presents rating gains and losses plus recorded streak snapshots', () => {
  const gain = buildResultRewardsModel(input());
  const loss = buildResultRewardsModel(
    input({
      outcome: 'lost',
      rating: { delta: -7.6, line: 'Rating −8', gated: false },
      reward: recordedReward({ win_streak_after: 0, best_win_streak: 6 }),
    }),
  );

  expect(gain.items).toEqual([
    { kind: 'rating', label: 'Rating', tone: 'up', value: '+12' },
    {
      kind: 'streak',
      label: 'Recorded streak',
      tone: 'neutral',
      value: '2',
    },
  ]);
  expect(loss.items).toEqual([
    { kind: 'rating', label: 'Rating', tone: 'down', value: '−8' },
    {
      kind: 'streak',
      label: 'Recorded streak',
      tone: 'neutral',
      value: '0',
    },
  ]);
  expect(loss.details).toContainEqual({
    kind: 'best',
    label: 'Best streak after this battle',
    value: '6 wins',
  });
});

test('counts completed quests separately from advanced quests', () => {
  const completed = buildResultRewardsModel(
    input({
      rating: { delta: 0, line: null, gated: false },
      reward: recordedReward({
        quests_advanced: ['win_battle', 'use_finisher'],
        quests_completed: [
          {
            quest_type: 'win_battle',
            title: 'First Victory',
            reward_credits: 2,
          },
          {
            quest_type: 'use_finisher',
            title: 'Finisher Focus',
            reward_credits: 1,
          },
        ],
      }),
    }),
  );
  const advanced = buildResultRewardsModel(
    input({
      outcome: 'draw',
      rating: { delta: 0, line: null, gated: false },
      reward: recordedReward({
        quests_advanced: ['complete_battles', 'use_finisher'],
      }),
    }),
  );

  expect(completed.title).toBe('Rewards');
  expect(completed.items).toContainEqual({
    kind: 'quests-completed',
    label: 'Quests complete',
    tone: 'up',
    value: '2',
  });
  expect(completed.details).toContainEqual({
    kind: 'quests',
    label: 'Completed in this battle',
    value: 'First Victory · Finisher Focus',
  });
  expect(advanced.title).toBe('Progress');
  expect(advanced.items).toEqual([
    {
      kind: 'quests-advanced',
      label: 'Quests advanced',
      tone: 'neutral',
      value: '2',
    },
  ]);
});

test('uses historical quest wording and isolates View quests to navigation', () => {
  const onViewQuests = jest.fn();
  const model = buildResultRewardsModel(
    input({
      rating: { delta: 0, line: null, gated: false },
      reward: recordedReward({
        quests_advanced: ['win_battle'],
        quests_completed: [
          {
            quest_type: 'win_battle',
            title: 'First Victory',
            reward_credits: 2,
          },
        ],
      }),
    }),
  );
  const ui = render(
    <ResultRewardDetails model={model} onViewQuests={onViewQuests} />,
  );

  expect(ui.getByText('Completed in this battle')).toBeTruthy();
  expect(ui.getByText('First Victory')).toBeTruthy();
  expect(ui.queryByText(/claim/i)).toBeNull();
  expect(onViewQuests).not.toHaveBeenCalled();
  fireEvent.press(ui.getByRole('button', { name: 'View quests' }));
  expect(onViewQuests).toHaveBeenCalledTimes(1);
});

test.each(['overturned', 'no_contest'] as const)(
  'keeps granted diamonds but replaces original rating and streak for %s review',
  (reviewStatus) => {
    const model = buildResultRewardsModel(
      input({
        reviewStatus,
        reward: recordedReward({
          credits_granted: 3,
          win_streak_after: 5,
          best_win_streak: 5,
          streak_milestone: true,
        }),
      }),
    );

    expect(model.items).toEqual([
      {
        kind: 'rating-correction',
        label: 'Rating',
        tone: 'neutral',
        value: 'Reversed',
      },
      { kind: 'credits', label: 'Diamonds', tone: 'up', amount: 3 },
    ]);
    expect(model.details).toContainEqual({
      kind: 'correction',
      label: 'Rating correction',
      value:
        'Original rating change of +12 was reversed. No replacement rating was awarded.',
    });
    expect(model.correctionLine).toBe(
      'Original rating change of +12 was reversed. No replacement rating was awarded.',
    );
    expect(model.details.map((detail) => detail.kind)).not.toContain(
      'milestone',
    );
    expect(model.details.map((detail) => detail.kind)).not.toContain('best');
  },
);

test.each([
  ['missing', { rating: { delta: null, line: null, gated: false } }],
  ['zero', { rating: { delta: 0, line: null, gated: false } }],
  ['exhibition', { exhibition: true }],
  [
    'quality-floor gated',
    {
      rating: {
        delta: null,
        line: 'No rating change — both prompts were below the quality floor.',
        gated: true,
      },
    },
  ],
] as const)(
  'uses neutral correction wording when the original rating is %s',
  (_label, overrides) => {
    const model = buildResultRewardsModel(
      input({ reviewStatus: 'overturned', ...overrides }),
    );

    expect(model.items[0]).toEqual({
      kind: 'rating-correction',
      label: 'Rating',
      tone: 'neutral',
      value: 'Reviewed',
    });
    expect(model.details).toContainEqual({
      kind: 'correction',
      label: 'Rating correction',
      value: 'Independent review completed. No replacement rating was awarded.',
    });
    expect(model.correctionLine).toBe(
      'Independent review completed. No replacement rating was awarded.',
    );
    expect(model.details.map((detail) => detail.value).join(' ')).not.toMatch(
      /reversed/i,
    );
  },
);

test('uses one large diamond amount inside quiet unframed reward cells', () => {
  const model = buildResultRewardsModel(
    input({ reward: recordedReward({ credits_granted: 3 }) }),
  );
  const ui = render(<ResultRewards model={model} />);

  expect(
    ui.getAllByTestId('game-icon-crystal', { includeHiddenElements: true }),
  ).toHaveLength(1);
  expect(StyleSheet.flatten(ui.getByText('+3').props.style)).toMatchObject({
    fontSize: 32,
  });
  expect(
    StyleSheet.flatten(ui.getByTestId('result-reward-credits').props.style)
      .borderWidth ?? 0,
  ).toBe(0);
});

test.each([
  [390, 1.15, 'row'],
  [389, 1, 'column'],
  [430, 1.16, 'column'],
] as const)(
  'uses %s-point width and %s font scale for a %s reward grid',
  (width, fontScale, flexDirection) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, height: 844, scale: 3, fontScale });
    const model = buildResultRewardsModel(
      input({ reward: recordedReward({ credits_granted: 3 }) }),
    );
    const ui = render(<ResultRewards model={model} />);

    expect(
      StyleSheet.flatten(ui.getByTestId('result-rewards-grid').props.style),
    ).toMatchObject({ flexDirection });
  },
);
