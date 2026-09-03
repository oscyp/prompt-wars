import React from 'react';
import { render } from '@testing-library/react-native';
import StreakMeter, {
  loginDots,
  nextWinMilestone,
  isWinMilestone,
  streakMeterLabel,
} from '@/components/StreakMeter';

describe('loginDots', () => {
  it('lights nothing at streak 0 and outlines the first dot', () => {
    expect(loginDots(0)).toEqual({ filled: 0, today: 0 });
  });

  it('lights one dot per day through a week, then wraps', () => {
    expect(loginDots(1)).toEqual({ filled: 1, today: 0 });
    expect(loginDots(3)).toEqual({ filled: 3, today: 2 });
    expect(loginDots(7)).toEqual({ filled: 7, today: 6 });
    expect(loginDots(8)).toEqual({ filled: 1, today: 0 });
  });
});

describe('nextWinMilestone', () => {
  it('returns the milestone itself when the streak sits on one', () => {
    expect(nextWinMilestone(3)).toBe(3);
    expect(nextWinMilestone(5)).toBe(5);
    expect(nextWinMilestone(7)).toBe(7);
    expect(nextWinMilestone(10)).toBe(10);
    expect(nextWinMilestone(15)).toBe(15);
  });

  it('looks ahead between milestones', () => {
    expect(nextWinMilestone(0)).toBe(3);
    expect(nextWinMilestone(2)).toBe(3);
    expect(nextWinMilestone(4)).toBe(5);
    expect(nextWinMilestone(6)).toBe(7);
    expect(nextWinMilestone(8)).toBe(10);
    expect(nextWinMilestone(11)).toBe(15);
  });

  it('knows which lengths are milestones', () => {
    expect([3, 5, 7, 10, 15, 20].every(isWinMilestone)).toBe(true);
    expect([0, 1, 2, 4, 6, 8, 9, 11].some(isWinMilestone)).toBe(false);
  });
});

describe('StreakMeter', () => {
  it('fills no dots on a streak of zero', () => {
    const { queryAllByTestId } = render(
      <StreakMeter
        loginStreak={0}
        claimedToday={false}
        winStreak={0}
        bestStreak={0}
      />,
    );
    expect(queryAllByTestId('streak-dot-filled')).toHaveLength(0);
    expect(queryAllByTestId('streak-dot-empty')).toHaveLength(7);
  });

  it('fills three dots on a three-day streak', () => {
    const { queryAllByTestId } = render(
      <StreakMeter loginStreak={3} claimedToday winStreak={1} bestStreak={4} />,
    );
    expect(queryAllByTestId('streak-dot-filled')).toHaveLength(3);
  });

  it('reaches the celebration line when the streak is on a milestone', () => {
    const { getByText } = render(
      <StreakMeter loginStreak={1} claimedToday winStreak={5} bestStreak={5} />,
    );
    getByText('Milestone reached! Win again to push your streak.');
  });

  it('counts down to a credit reward between milestones', () => {
    const { getByText } = render(
      <StreakMeter loginStreak={1} claimedToday winStreak={4} bestStreak={7} />,
    );
    getByText('1 more win to a credit reward (best: 7).');
  });

  it('is one accessible element whose label covers streaks, dots and hints', () => {
    const props = {
      loginStreak: 3,
      claimedToday: false,
      winStreak: 2,
      bestStreak: 7,
    };
    const { getByLabelText } = render(<StreakMeter {...props} />);
    const card = getByLabelText(streakMeterLabel(props));
    expect(card.props.accessible).toBe(true);
    expect(streakMeterLabel(props)).toContain('Daily streak 3 days');
    expect(streakMeterLabel(props)).toContain('Win streak 2, best 7');
    expect(streakMeterLabel(props)).toContain(
      'Come back daily — login rewards grow with your streak.',
    );
  });

  it('uses the singular for a one-day streak', () => {
    const { getByText } = render(
      <StreakMeter loginStreak={1} claimedToday winStreak={0} bestStreak={0} />,
    );
    getByText('1 day');
  });
});
