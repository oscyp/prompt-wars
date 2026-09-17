import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ItemGrid from '@/components/ItemGrid';
import OptionGrid from '@/components/OptionGrid';
import StatAllocator from '@/components/StatAllocator';
import ModeToggle from '@/components/edit-character/ModeToggle';
import { GameButton } from '@/components/game';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 430, height: 900, scale: 3, fontScale: 1 })),
}));
jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
  MaterialCommunityIcons: 'Icon',
}));
jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));

const item = {
  id: 'one',
  name: 'Żaneta’s exceptionally elaborate clockwork instrument',
  description: 'A tool.',
  itemClass: 'instrument' as const,
};

describe('adaptive competition and creator controls', () => {
  beforeEach(() =>
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 430, height: 900, scale: 3, fontScale: 1 }),
  );

  it.each([
    { width: 320, fontScale: 1 },
    { width: 430, fontScale: 1.8 },
  ])(
    'retains complete item labels and selection at $width points / $fontScale text',
    ({ width, fontScale }) => {
      jest
        .mocked(useWindowDimensions)
        .mockReturnValue({ width, height: 800, scale: 3, fontScale });
      const onSelect = jest.fn();
      const { getByRole, getByText } = render(
        <ItemGrid items={[item]} selectedId={undefined} onSelect={onSelect} />,
      );
      const button = getByRole('button');
      expect(StyleSheet.flatten(button.props.style)).toMatchObject({
        width: '100%',
        minHeight: 128,
      });
      expect(
        StyleSheet.flatten(button.props.style).aspectRatio,
      ).toBeUndefined();
      expect(getByText(item.name).props.numberOfLines).toBeUndefined();
      expect(getByText(item.name).props.allowFontScaling).toBe(true);
      fireEvent.press(button);
      expect(onSelect).toHaveBeenCalledWith('one');
    },
  );

  it('uses two item columns only at standard text on a wide phone', () => {
    const { getByRole } = render(
      <ItemGrid items={[item]} selectedId="one" onSelect={jest.fn()} />,
    );
    expect(StyleSheet.flatten(getByRole('button').props.style).width).toBe(
      '48%',
    );
    expect(getByRole('button').props.accessibilityState.selected).toBe(true);
  });

  it('keeps every trait reachable while disabling changes', () => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 320, height: 800, scale: 3, fontScale: 1.8 });
    const onChange = jest.fn();
    const { getAllByRole } = render(
      <OptionGrid
        label="Vibe"
        options={[
          { value: 'calm', label: 'Calm and collected' },
          { value: 'bold', label: 'Bold and confident' },
        ]}
        value="calm"
        disabled
        disabledReason="Battle in progress"
        onChange={onChange}
      />,
    );
    for (const option of getAllByRole('radio')) {
      expect(StyleSheet.flatten(option.props.style).width).toBe('100%');
      expect(option.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(option);
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes only one selected description mode and preserves mode switching', () => {
    const onChange = jest.fn();
    const { getAllByRole, UNSAFE_getAllByType } = render(
      <ModeToggle value="guided" onChange={onChange} />,
    );
    const tabs = getAllByRole('tab');
    expect(tabs.map((tab) => tab.props.accessibilityState.selected)).toEqual([
      true,
      false,
    ]);
    expect(
      UNSAFE_getAllByType(GameButton).map((button) => button.props.tone),
    ).toEqual(['secondary', 'secondary']);
    fireEvent.press(tabs[1]);
    expect(onChange).toHaveBeenCalledWith('prompt');
  });

  it('keeps stat increment/decrement targets at least 48 points', () => {
    const { getByLabelText } = render(
      <StatAllocator
        value={{ strength: 5, stamina: 5, agility: 5, focus: 5 }}
        onChange={jest.fn()}
        accentColor="#C4AFFE"
      />,
    );
    for (const action of ['Increase', 'Decrease']) {
      const style = StyleSheet.flatten(
        getByLabelText(`${action} Strength`).props.style,
      );
      expect(style.width).toBeGreaterThanOrEqual(48);
      expect(style.height).toBeGreaterThanOrEqual(48);
    }
  });
});
