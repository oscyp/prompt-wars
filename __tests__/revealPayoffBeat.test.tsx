/**
 * The payoff beat renders what `payoffRows` decides, says so to a screen
 * reader row by row, and falls back to the pending / unavailable lines.
 */
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render } from '@testing-library/react-native';
import { RevealPayoffBeat, payoffRowLabel } from '@/components/reveal';
import {
  REWARDS_PENDING_LINE,
  REWARDS_UNAVAILABLE_LINE,
  payoffRows,
} from '@/utils/revealBeats';
import type { RewardSummary } from '@/types/battle';
import { hapticSuccess } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
// Counters snap to their final value under Reduce Motion, so the text is
// assertable without driving Reanimated.
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => true),
}));

const reward = (over: Partial<RewardSummary> = {}): RewardSummary => ({
  credits_granted: 0,
  credit_reasons: [],
  credits_eligible: true,
  win_streak_after: 1,
  best_win_streak: 4,
  streak_milestone: false,
  quests_advanced: [],
  quests_completed: [],
  mode: 'ranked',
  ...over,
});

const insets = { top: 0, bottom: 0 };

describe('RevealPayoffBeat', () => {
  beforeEach(() => (hapticSuccess as jest.Mock).mockReset());

  it('renders a row per payoff with label, value and detail', () => {
    const rows = payoffRows({
      outcome: 'won',
      isBot: false,
      mode: 'ranked',
      rating: { delta: 12.4, line: 'Rating +12', gated: false },
      reward: reward({
        credits_granted: 5,
        win_streak_after: 3,
        best_win_streak: 3,
        streak_milestone: true,
      }),
      battleCompleted: true,
    });
    const { getByText, getByLabelText } = render(
      <RevealPayoffBeat
        rows={rows}
        fallbackLine={null}
        pending={false}
        reduceMotion
        insets={insets}
      />,
    );
    getByText('Your rewards');
    getByText('Rating');
    getByText('+12');
    getByText('Credits');
    getByText('+5 cr');
    getByText('Win streak 3 milestone');
    getByText('Win streak');
    getByText('3');
    getByText('New best!');
    for (const row of rows) getByLabelText(payoffRowLabel(row));
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows static values and no success haptic for a loss', () => {
    const rows = payoffRows({
      outcome: 'lost',
      isBot: false,
      mode: 'ranked',
      rating: { delta: -9, line: 'Rating -9', gated: false },
      reward: reward({ win_streak_after: 0, best_win_streak: 4 }),
      battleCompleted: true,
    });
    const { getByText } = render(
      <RevealPayoffBeat
        rows={rows}
        fallbackLine={null}
        pending={false}
        reduceMotion
        insets={insets}
      />,
    );
    getByText('−9');
    getByText('Reset');
    getByText('Best 4');
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('shows the pending line with a spinner while rewards are tallied', () => {
    const { getByText, UNSAFE_getAllByType } = render(
      <RevealPayoffBeat
        rows={[]}
        fallbackLine={REWARDS_PENDING_LINE}
        pending
        reduceMotion
        insets={insets}
      />,
    );
    getByText(REWARDS_PENDING_LINE);
    expect(UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('keeps the rating row and adds the pending line when only rewards are late', () => {
    const rows = payoffRows({
      outcome: 'won',
      isBot: false,
      mode: 'ranked',
      rating: { delta: 12, line: 'Rating +12', gated: false },
      reward: null,
      battleCompleted: false,
    });
    const { getByText, UNSAFE_getAllByType } = render(
      <RevealPayoffBeat
        rows={rows}
        fallbackLine={REWARDS_PENDING_LINE}
        pending
        reduceMotion
        insets={insets}
      />,
    );
    getByText('Rating');
    getByText(REWARDS_PENDING_LINE);
    expect(UNSAFE_getAllByType(ActivityIndicator)).toHaveLength(1);
  });

  it('says so, without a spinner, when no summary was ever recorded', () => {
    const { getByText, UNSAFE_queryAllByType } = render(
      <RevealPayoffBeat
        rows={[]}
        fallbackLine={REWARDS_UNAVAILABLE_LINE}
        pending={false}
        reduceMotion
        insets={insets}
      />,
    );
    getByText(REWARDS_UNAVAILABLE_LINE);
    expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });
});
