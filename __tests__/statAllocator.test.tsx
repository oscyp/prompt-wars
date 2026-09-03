import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StatAllocator from '@/components/StatAllocator';
import { ARCHETYPE_STAT_PRESETS, BALANCED_STATS } from '@/utils/statAllocation';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

describe('StatAllocator', () => {
  it('increments through onChange and reports the pool', () => {
    const onChange = jest.fn();
    const freed = { ...BALANCED_STATS, focus: 4 };
    const { getByLabelText, getByText } = render(
      <StatAllocator value={freed} onChange={onChange} accentColor="#ff0000" />,
    );
    getByText('1 point left');
    fireEvent.press(getByLabelText('Increase Strength'));
    expect(onChange).toHaveBeenCalledWith({ ...freed, strength: 6 });
  });

  it('disables every increase once the pool is spent, and decrease at the floor', () => {
    const onChange = jest.fn();
    const floor = { strength: 1, stamina: 9, agility: 5, focus: 5 };
    const { getByLabelText, getByText } = render(
      <StatAllocator value={floor} onChange={onChange} accentColor="#ff0000" />,
    );
    getByText('All points placed');
    expect(
      getByLabelText('Increase Strength').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      getByLabelText('Decrease Strength').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      getByLabelText('Decrease Stamina').props.accessibilityState.disabled,
    ).toBe(false);
    fireEvent.press(getByLabelText('Increase Strength'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('offers the archetype preset and marks the one in use', () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <StatAllocator
        value={BALANCED_STATS}
        onChange={onChange}
        archetype="titan"
        accentColor="#ff0000"
      />,
    );
    expect(getByLabelText('Balanced').props.accessibilityState.selected).toBe(
      true,
    );
    fireEvent.press(getByLabelText('The Titan preset'));
    expect(onChange).toHaveBeenCalledWith(ARCHETYPE_STAT_PRESETS.titan);
  });

  it('exposes each stat as an adjustable row with its effect as the hint', () => {
    const onChange = jest.fn();
    const freed = { ...BALANCED_STATS, focus: 4 };
    const { getByLabelText } = render(
      <StatAllocator value={freed} onChange={onChange} accentColor="#ff0000" />,
    );
    const row = getByLabelText('Agility, 5 out of 10');
    expect(row.props.accessibilityRole).toBe('adjustable');
    expect(row.props.accessibilityHint).toMatch(/tiebreak/i);
    fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onChange).toHaveBeenCalledWith({ ...freed, agility: 6 });
  });
});
