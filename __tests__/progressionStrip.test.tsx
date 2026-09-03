/**
 * The progression strip: an honest rating row, one row per progression fact,
 * and rows that lead somewhere are buttons.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProgressionStrip, {
  PROGRESS_ERROR_COPY,
  ratingRowLabel,
} from '@/components/profile/ProgressionStrip';
import {
  progressionRows,
  ratingView,
  type ProgressionRow,
} from '@/utils/profileView';

const ROWS: ProgressionRow[] = progressionRows({
  currentStreak: 3,
  bestStreak: 5,
  loginStreak: 2,
  rank: { rank: 12, seasonName: 'Season 1', endsAt: null },
  hasRatedBattle: true,
  unlock: null,
});

describe('ProgressionStrip', () => {
  it('renders the title and every row with its value', () => {
    const { getByText } = render(
      <ProgressionStrip
        rating={ratingView({ rating: 1537, hasRatedBattle: true })}
        rows={ROWS}
        onNavigate={jest.fn()}
      />,
    );
    getByText('Progress');
    getByText('Rating');
    getByText('1537');
    getByText('Win streak');
    getByText('3');
    getByText('Login streak');
    getByText('2 days');
    getByText('Season rank');
    getByText('#12');
  });

  it('says Unrated with the hint until a ranked battle has been played', () => {
    const view = ratingView({ rating: 1500, hasRatedBattle: false });
    const { getByText, getByLabelText } = render(
      <ProgressionStrip rating={view} rows={ROWS} onNavigate={jest.fn()} />,
    );
    getByText('Unrated');
    getByText('Win or lose a ranked battle to get a rating');
    getByLabelText(ratingRowLabel(view));
    expect(ratingRowLabel(view)).toBe(
      'Rating: unrated. Win or lose a ranked battle to get a rating',
    );
  });

  it('does not repeat the caption once rated', () => {
    const view = ratingView({ rating: 1537, hasRatedBattle: true });
    const { queryAllByText } = render(
      <ProgressionStrip rating={view} rows={[]} onNavigate={jest.fn()} />,
    );
    expect(queryAllByText('Rating')).toHaveLength(1);
    expect(ratingRowLabel(view)).toBe('Rating 1537');
  });

  it('navigates from rows that carry a route and not from the others', () => {
    const onNavigate = jest.fn();
    const rank = ROWS.find((r) => r.key === 'rank')!;
    const streak = ROWS.find((r) => r.key === 'winStreak')!;
    const { getByLabelText } = render(
      <ProgressionStrip
        rating={ratingView({ rating: 1537, hasRatedBattle: true })}
        rows={ROWS}
        onNavigate={onNavigate}
      />,
    );
    const rankRow = getByLabelText(rank.accessibilityLabel);
    expect(rankRow.props.accessibilityRole).toBe('button');
    fireEvent.press(rankRow);
    expect(onNavigate).toHaveBeenCalledWith('/(tabs)/rankings');

    const streakRow = getByLabelText(streak.accessibilityLabel);
    expect(streakRow.props.accessibilityRole).toBeUndefined();
    fireEvent.press(streakRow);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('shows the unlock row as a shop link', () => {
    const rows = progressionRows({
      currentStreak: 0,
      bestStreak: 0,
      loginStreak: null,
      rank: null,
      hasRatedBattle: false,
      unlock: {
        item: { name: 'Iron Frame' } as never,
        metric: 'wins',
        remaining: 2,
        target: 5,
        hint: '2 more wins to unlock Iron Frame',
      },
    });
    const onNavigate = jest.fn();
    const { getByText, getByLabelText } = render(
      <ProgressionStrip
        rating={ratingView({ rating: null, hasRatedBattle: false })}
        rows={rows}
        onNavigate={onNavigate}
      />,
    );
    getByText('Iron Frame');
    getByText('2 more wins to unlock Iron Frame');
    fireEvent.press(
      getByLabelText(rows.find((r) => r.key === 'unlock')!.accessibilityLabel),
    );
    expect(onNavigate).toHaveBeenCalledWith('/(profile)/shop');
  });

  it('replaces the rows with one line and a Retry when the reads failed', () => {
    const onRetry = jest.fn();
    const { getByText, queryByText, getByLabelText } = render(
      <ProgressionStrip
        rating={ratingView({ rating: 1537, hasRatedBattle: true })}
        rows={ROWS}
        onNavigate={jest.fn()}
        error
        onRetry={onRetry}
      />,
    );
    getByText(PROGRESS_ERROR_COPY.body);
    expect(queryByText('1537')).toBeNull();
    expect(queryByText('Win streak')).toBeNull();
    fireEvent.press(getByLabelText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
