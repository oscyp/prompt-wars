import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MoveTypeSelector from '@/components/MoveTypeSelector';
import { hapticSelection } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

describe('MoveTypeSelector', () => {
  beforeEach(() => {
    (hapticSelection as jest.Mock).mockClear();
  });

  it('renders one button per move type with a stable label', () => {
    const { getByLabelText } = render(
      <MoveTypeSelector value={null} onChange={() => {}} />,
    );
    expect(getByLabelText('Select attack move')).toBeTruthy();
    expect(getByLabelText('Select defense move')).toBeTruthy();
    expect(getByLabelText('Select finisher move')).toBeTruthy();
  });

  it('explains the matchup in the accessibility hint from MOVE_META', () => {
    const { getByLabelText } = render(
      <MoveTypeSelector value={null} onChange={() => {}} />,
    );
    expect(getByLabelText('Select attack move').props.accessibilityHint).toBe(
      'Beats finisher, loses to defense',
    );
    expect(getByLabelText('Select defense move').props.accessibilityHint).toBe(
      'Beats attack, loses to finisher',
    );
    expect(getByLabelText('Select finisher move').props.accessibilityHint).toBe(
      'Beats defense, loses to attack',
    );
  });

  it('marks only the current value as selected', () => {
    const { getByLabelText } = render(
      <MoveTypeSelector value="defense" onChange={() => {}} />,
    );
    expect(
      getByLabelText('Select defense move').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabelText('Select attack move').props.accessibilityState.selected,
    ).toBe(false);
    expect(
      getByLabelText('Select finisher move').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('fires onChange with the tapped move and ticks a haptic', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <MoveTypeSelector value={null} onChange={onChange} />,
    );
    fireEvent.press(getByLabelText('Select finisher move'));
    expect(onChange).toHaveBeenCalledWith('finisher');
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('flags the suggested counter in the label and shows the pill', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <MoveTypeSelector
        value={null}
        onChange={() => {}}
        suggestedCounter="defense"
      />,
    );
    expect(
      getByLabelText('Select defense move, counters opponent pattern'),
    ).toBeTruthy();
    expect(getByText('COUNTER')).toBeTruthy();
    // Exactly one pill.
    expect(queryByText('COUNTER')).toBeTruthy();
  });

  it('shows no pill without a suggested counter', () => {
    const { queryByText } = render(
      <MoveTypeSelector value={null} onChange={() => {}} />,
    );
    expect(queryByText('COUNTER')).toBeNull();
  });

  it('every button is at least 56pt tall', () => {
    const { getByLabelText } = render(
      <MoveTypeSelector value="attack" onChange={() => {}} />,
    );
    for (const move of ['attack', 'defense', 'finisher']) {
      const style = StyleSheetFlatten(
        getByLabelText(`Select ${move} move`).props.style,
      );
      expect(style.minHeight).toBeGreaterThanOrEqual(56);
    }
  });
});

function StyleSheetFlatten(style: unknown): Record<string, number> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StyleSheet } = require('react-native');
  return StyleSheet.flatten(style) as Record<string, number>;
}
