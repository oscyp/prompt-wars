import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArchetypeSheet from '@/components/edit-character/ArchetypeSheet';
import type { EditPricing } from '@/utils/editCooldowns';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/utils/haptics', () => ({
  hapticSelection: jest.fn(),
}));

const FOURTEEN_DAYS = 14 * 86400;

const pricing = (cooldownMs = 0): EditPricing => ({
  prices: { archetype: { credits: 0, cooldownSeconds: FOURTEEN_DAYS } },
  cooldownMs: cooldownMs > 0 ? { archetype: cooldownMs } : {},
});

describe('ArchetypeSheet', () => {
  it('lists the five classes and marks the staged one', () => {
    const { getAllByRole, getByLabelText } = render(
      <ArchetypeSheet
        visible
        value="mystic"
        savedValue="mystic"
        pricing={pricing()}
        onStage={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(getAllByRole('radio')).toHaveLength(5);
    expect(
      getByLabelText('Archetype: The Mystic').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabelText('Archetype: The Titan').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('stages a pick and states the lock before the change', () => {
    const onStage = jest.fn();
    const { getByLabelText, getByText } = render(
      <ArchetypeSheet
        visible
        value="mystic"
        savedValue="mystic"
        pricing={pricing()}
        onStage={onStage}
        onClose={jest.fn()}
      />,
    );
    getByText('A change locks it for 14 days.');
    fireEvent.press(getByLabelText('Archetype: The Titan'));
    expect(onStage).toHaveBeenCalledWith('titan');
  });

  it('says the choice is unsaved once it differs from the saved class', () => {
    const { getByText } = render(
      <ArchetypeSheet
        visible
        value="titan"
        savedValue="mystic"
        pricing={pricing()}
        onStage={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    getByText('Unsaved · applied when you save.');
  });

  it('shows the countdown and stops taking taps while cooling', () => {
    const onStage = jest.fn();
    const { getByLabelText, getByText, queryByText } = render(
      <ArchetypeSheet
        visible
        value="mystic"
        savedValue="mystic"
        pricing={pricing(3 * 86400 * 1000)}
        onStage={onStage}
        onClose={jest.fn()}
      />,
    );
    getByText('Available in 3d');
    expect(queryByText('A change locks it for 14 days.')).toBeNull();
    const card = getByLabelText('Archetype: The Titan');
    expect(card.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(card);
    expect(onStage).not.toHaveBeenCalled();
  });

  it('closes on Done', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <ArchetypeSheet
        visible
        value="mystic"
        savedValue="mystic"
        pricing={pricing()}
        onStage={jest.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
