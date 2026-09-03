/**
 * The rubric bars are the only place a player sees WHY they scored what they
 * scored, so every category must be present, every row must be readable by a
 * screen reader as a value, and the opponent comparison must not depend on
 * colour alone.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import RubricBars, { RUBRIC_LABELS } from '@/components/RubricBars';
import type { RubricScoreSet } from '@/types/battle';

const mine: RubricScoreSet = {
  clarity: 8.2,
  originality: 6,
  specificity: 7.5,
  theme_fit: 9,
  archetype_fit: 5.5,
  dramatic_potential: 10,
};

const theirs: RubricScoreSet = {
  clarity: 6.1,
  originality: 7,
  specificity: 7.5,
  theme_fit: 4,
  archetype_fit: 8,
  dramatic_potential: 3,
};

describe('RubricBars', () => {
  it('renders all six labels, untruncated', () => {
    const { getByText } = render(<RubricBars scores={mine} />);
    for (const label of Object.values(RUBRIC_LABELS)) {
      getByText(label);
    }
    expect(Object.keys(RUBRIC_LABELS)).toHaveLength(6);
  });

  it('exposes each row as a progressbar with a numeric value', () => {
    const { getAllByRole } = render(<RubricBars scores={mine} />);
    const rows = getAllByRole('progressbar');
    expect(rows).toHaveLength(6);
    expect(rows[0].props.accessibilityValue).toEqual({
      min: 0,
      max: 10,
      now: 8.2,
    });
    expect(rows[5].props.accessibilityValue).toEqual({
      min: 0,
      max: 10,
      now: 10,
    });
    expect(rows[0].props.accessibilityLabel).toBe('Clarity: 8.2 out of 10');
  });

  it('clamps out-of-range and missing scores into the value', () => {
    const { getAllByRole } = render(
      <RubricBars scores={{ clarity: 14, originality: -2 }} />,
    );
    const rows = getAllByRole('progressbar');
    expect(rows[0].props.accessibilityValue.now).toBe(10);
    expect(rows[1].props.accessibilityValue.now).toBe(0);
    // Absent categories still render, at zero.
    expect(rows[2].props.accessibilityValue.now).toBe(0);
  });

  it('adds the legend and the opponent’s numbers when comparing', () => {
    const { getByText, getAllByRole, getByLabelText } = render(
      <RubricBars scores={mine} opponentScores={theirs} />,
    );
    getByText('Your score');
    getByText('Opponent');
    getByLabelText(/Legend:/);
    getByText('8.2 vs 6.1');
    expect(getAllByRole('progressbar')[0].props.accessibilityLabel).toBe(
      'Clarity: you 8.2 out of 10, opponent 6.1',
    );
  });

  it('shows no legend without an opponent', () => {
    const { queryByText } = render(<RubricBars scores={mine} />);
    expect(queryByText('Your score')).toBeNull();
    expect(queryByText('Opponent')).toBeNull();
  });
});
