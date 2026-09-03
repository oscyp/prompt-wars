import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ModeCard from '@/components/ModeCard';
import { BATTLE_MODES } from '@/constants/BattleModes';
import { hapticSelection } from '@/utils/haptics';

jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

const ranked = BATTLE_MODES.find((m) => m.mode === 'ranked')!;
const bot = BATTLE_MODES.find((m) => m.mode === 'bot')!;

describe('ModeCard', () => {
  beforeEach(() => {
    (hapticSelection as jest.Mock).mockClear();
  });

  it('reads title and description as one button', () => {
    const { getByLabelText, getByText } = render(
      <ModeCard info={ranked} onPress={jest.fn()} />,
    );
    getByText('Ranked Battle');
    getByText('Compete for ranking points');
    const card = getByLabelText('Ranked Battle. Compete for ranking points');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState).toEqual({ disabled: false });
  });

  it('reports its mode and ticks on press', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ModeCard info={bot} onPress={onPress} />,
    );
    fireEvent.press(
      getByLabelText('Practice vs Bot. Learn the basics against AI'),
    );
    expect(onPress).toHaveBeenCalledWith('bot');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it('exposes and enforces the disabled state', () => {
    const onPress = jest.fn();
    const { getByLabelText } = render(
      <ModeCard info={ranked} onPress={onPress} disabled />,
    );
    const card = getByLabelText('Ranked Battle. Compete for ranking points');
    expect(card.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(card);
    expect(onPress).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });
});
