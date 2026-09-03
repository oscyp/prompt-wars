import React from 'react';
import { render } from '@testing-library/react-native';
import MoveTypeChipRow from '@/components/MoveTypeChipRow';

describe('MoveTypeChipRow', () => {
  it('reads the label and every move, capitalised, as one accessible node', () => {
    const { getByLabelText } = render(
      <MoveTypeChipRow
        history={['attack', 'defense', 'attack']}
        label="Opponent's moves this battle"
      />,
    );
    expect(
      getByLabelText("Opponent's moves this battle: Attack, Defense, Attack"),
    ).toBeTruthy();
  });

  it('uses the default label when none is given', () => {
    const { getByLabelText } = render(
      <MoveTypeChipRow history={['finisher']} />,
    );
    expect(getByLabelText("Opponent's last moves: Finisher")).toBeTruthy();
  });

  it('says none yet and shows the empty copy when there is no history', () => {
    const { getByLabelText, getByText } = render(
      <MoveTypeChipRow history={[]} label="Opponent's recent moves" />,
    );
    expect(getByLabelText("Opponent's recent moves: none yet")).toBeTruthy();
    expect(getByText('No history yet')).toBeTruthy();
  });

  it('keeps only the most recent `max` moves, oldest first', () => {
    const { getByLabelText, queryAllByText } = render(
      <MoveTypeChipRow
        history={[
          'attack',
          'attack',
          'defense',
          'finisher',
          'defense',
          'attack',
        ]}
        max={3}
        label="Recent"
      />,
    );
    expect(getByLabelText('Recent: Finisher, Defense, Attack')).toBeTruthy();
    expect(queryAllByText('ATTACK')).toHaveLength(1);
    expect(queryAllByText('DEFENSE')).toHaveLength(1);
    expect(queryAllByText('FINISHER')).toHaveLength(1);
  });

  it('renders a visible chip per move with the shape-cue text', () => {
    const { getAllByText } = render(
      <MoveTypeChipRow history={['attack', 'attack']} />,
    );
    expect(getAllByText('ATTACK')).toHaveLength(2);
  });
});
