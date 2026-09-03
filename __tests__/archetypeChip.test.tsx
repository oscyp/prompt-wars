import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArchetypeChip, {
  archetypeChipText,
} from '@/components/edit-character/ArchetypeChip';

describe('archetypeChipText', () => {
  it('names the class and what it rewards', () => {
    expect(archetypeChipText('strategist')).toBe(
      'The Strategist · rewards Defense moves',
    );
    expect(archetypeChipText('mystic')).toBe(
      'The Mystic · rewards Originality',
    );
  });
});

describe('ArchetypeChip', () => {
  it('reads the class and opens the picker on tap', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(
      <ArchetypeChip archetype="titan" variant="stage" onPress={onPress} />,
    );
    getByText('The Titan · rewards Attack moves');
    const chip = getByLabelText('Archetype: The Titan · rewards Attack moves');
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
      getByLabelText('Archetype: The Engineer · rewards Specificity').props
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
    const chip = getByLabelText(
      'Archetype: The Trickster · rewards unexpected angles',
    );
    expect(chip.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });
});
