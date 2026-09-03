/**
 * Move chips read as one sentence each, show every move even at zero, and
 * say why they are absent when nothing has been locked in.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import MoveUsageChips, {
  moveChipLabel,
  moveShareLabel,
  roundWinRateLabel,
} from '@/components/MoveUsageChips';
import { moveUsage, MOVES_EMPTY } from '@/utils/statsInsights';

const ME = 'me-1';

const USAGE = moveUsage(
  [
    {
      battle_id: 'b1',
      round_number: 1,
      move_type: 'attack',
      custom_prompt_text: 'a',
    },
    {
      battle_id: 'b1',
      round_number: 2,
      move_type: 'attack',
      custom_prompt_text: 'b',
    },
    {
      battle_id: 'b1',
      round_number: 3,
      move_type: 'defense',
      custom_prompt_text: 'c',
    },
  ],
  [
    {
      battle_id: 'b1',
      round_number: 1,
      round_winner_id: ME,
      player_one_score: 50,
      player_two_score: 40,
    },
    {
      battle_id: 'b1',
      round_number: 2,
      round_winner_id: 'them',
      player_one_score: 40,
      player_two_score: 50,
    },
  ],
  ME,
);

describe('labels', () => {
  it('rounds shares and win rates to whole percentages', () => {
    expect(moveShareLabel(0.6667)).toBe('67%');
    expect(moveShareLabel(0)).toBe('0%');
    expect(roundWinRateLabel(0.5)).toBe('won 50% of rounds');
    expect(roundWinRateLabel(null)).toBe('no rounds yet');
  });

  it('composes one sentence per chip', () => {
    expect(moveChipLabel(USAGE[0])).toBe(
      'Attack: 67% of your moves, won 50% of rounds',
    );
    expect(moveChipLabel(USAGE[1])).toBe(
      'Defense: 33% of your moves, no rounds yet',
    );
    expect(moveChipLabel(USAGE[2])).toBe(
      'Finisher: 0% of your moves, no rounds yet',
    );
  });
});

describe('MoveUsageChips', () => {
  it('renders one accessible chip per move with its share and win rate', () => {
    const { getByLabelText, getByText, getAllByText } = render(
      <MoveUsageChips usage={USAGE} emptyText={MOVES_EMPTY} />,
    );
    getByLabelText('Attack: 67% of your moves, won 50% of rounds');
    getByLabelText('Defense: 33% of your moves, no rounds yet');
    getByLabelText('Finisher: 0% of your moves, no rounds yet');
    getByText('Attack');
    getByText('67%');
    getByText('won 50% of rounds');
    expect(getAllByText('no rounds yet')).toHaveLength(2);
  });

  it('shows the empty copy when nothing has been locked in', () => {
    const { getByText, queryByText } = render(
      <MoveUsageChips usage={moveUsage([], [], ME)} emptyText={MOVES_EMPTY} />,
    );
    getByText(MOVES_EMPTY);
    expect(queryByText('Attack')).toBeNull();

    const bare = render(<MoveUsageChips usage={[]} emptyText={MOVES_EMPTY} />);
    bare.getByText(MOVES_EMPTY);
  });
});
