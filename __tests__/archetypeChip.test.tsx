import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArchetypeChip, {
  archetypeChipText,
} from '@/components/edit-character/ArchetypeChip';

describe('archetypeChipText', () => {
  it('names the free identity and its expressive theme', () => {
    expect(archetypeChipText('strategist')).toBe(
      'The Strategist · careful plans',
    );
    expect(archetypeChipText('mystic')).toBe('The Mystic · Originality');
  });
});

describe('ArchetypeChip', () => {
  it('reads the class and opens the picker on tap', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(
      <ArchetypeChip archetype="titan" variant="stage" onPress={onPress} />,
    );
    getByText('The Titan · bold actions');
    const chip = getByLabelText('Archetype: The Titan · bold actions');
    expect(chip.props.accessibilityHint).toBe('Change archetype');
    fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says it is locked while the cooldown runs', () => {
    const { getByLabelText } = render(
      <ArchetypeChip
        archetype="engineer"
        variant="compact"
        locked
        onPress={jest.fn()}
      />,
    );
    expect(
      getByLabelText('Archetype: The Engineer · Specificity').props
        .accessibilityHint,
    ).toContain('Locked');
  });

  it('does not fire while disabled', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ArchetypeChip
        archetype="trickster"
        variant="compact"
        disabled
        onPress={onPress}
      />,
    );
    const chip = getByLabelText('Archetype: The Trickster · unexpected angles');
    expect(chip.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });
});
