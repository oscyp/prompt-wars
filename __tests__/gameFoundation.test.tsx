import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { isLoaded } from 'expo-font';
import { GameButton, GameField, GameText } from '@/components/game';
import { Colors } from '@/constants/Colors';
import { HighContrastColors } from '@/hooks/useThemedColors';
import { contrastRatio } from '@/utils/contrast';

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));

describe('native game controls', () => {
  beforeEach(() => jest.mocked(isLoaded).mockReturnValue(false));

  it('activates a labelled action and exposes selection', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <GameButton label="Choose defense" selected onPress={onPress} />,
    );
    const button = getByRole('button', { name: 'Choose defense' });
    expect(button.props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['disabled', 'busy', 'unavailable'] as const)(
    'blocks activation when %s',
    (state) => {
      const onPress = jest.fn();
      const { getByRole } = render(
        <GameButton label="Lock in" {...{ [state]: true }} onPress={onPress} />,
      );
      const button = getByRole('button', { name: 'Lock in' });
      expect(button.props.accessibilityState).toMatchObject({
        disabled: true,
        busy: state === 'busy',
      });
      fireEvent.press(button);
      expect(onPress).not.toHaveBeenCalled();
    },
  );

  it('announces an invalid field, preserves system input and prevents disabled editing', () => {
    const { getByLabelText, getByRole } = render(
      <GameField label="Fighter name" error="Choose a name" disabled />,
    );
    const field = getByLabelText('Fighter name');
    expect(field.props.editable).toBe(false);
    expect(field.props.accessibilityHint).toContain('Choose a name');
    expect(field.props.allowFontScaling).not.toBe(false);
    expect(getByRole('alert')).toHaveTextContent('Choose a name');
  });

  it.each(['busy', 'unavailable'] as const)(
    'makes a %s field read-only',
    (state) => {
      const { getByLabelText } = render(
        <GameField label="Prompt" {...{ [state]: true }} />,
      );
      const field = getByLabelText('Prompt');
      expect(field.props.editable).toBe(false);
      expect(field.props.accessibilityState).toMatchObject({
        disabled: true,
        busy: state === 'busy',
      });
    },
  );

  it('falls back while fonts are unavailable and keeps unsupported scripts readable', () => {
    const { getByText, rerender } = render(
      <GameText variant="display">Arena</GameText>,
    );
    expect(getByText('Arena')).not.toHaveStyle({
      fontFamily: 'BarlowCondensed-ExtraBoldItalic',
    });
    expect(getByText('Arena').props.allowFontScaling).not.toBe(false);
    jest.mocked(isLoaded).mockReturnValue(true);
    rerender(<GameText variant="display">Arena</GameText>);
    expect(getByText('Arena')).toHaveStyle({
      fontFamily: 'BarlowCondensed-ExtraBoldItalic',
    });
    rerender(<GameText variant="fighter">戦士 Mira</GameText>);
    expect(getByText('戦士 Mira')).not.toHaveStyle({
      fontFamily: 'BarlowCondensed-Bold',
    });
  });

  it.each([
    ['1 234 567 890', 36, 54],
    ['1.234.567,89 zł\nza pakiet', 24, 36],
    ['١٬٢٣٤٬٥٦٧٫٨٩ د.إ', 24, 36],
  ])(
    'keeps scaled localized value %s in a proportional line box',
    (value, fontSize, lineHeight) => {
      const { getByText } = render(
        <GameText style={[{ fontSize: 18 }, { fontSize }]}>{value}</GameText>,
      );
      expect(getByText(value)).toHaveStyle({ fontSize, lineHeight });
      expect(getByText(value).props.allowFontScaling).toBe(true);
      expect(getByText(value).props.numberOfLines).toBeUndefined();
    },
  );

  it('honors the final explicit caller line height', () => {
    const { getByText } = render(
      <GameText style={[{ fontSize: 36, lineHeight: 60 }, { lineHeight: 58 }]}>
        Balance
      </GameText>,
    );
    expect(getByText('Balance')).toHaveStyle({ fontSize: 36, lineHeight: 58 });
  });

  it('renders fighter names with the upright bold face', () => {
    jest.mocked(isLoaded).mockReturnValue(true);
    const { getByText } = render(<GameText variant="fighter">Mira</GameText>);
    expect(getByText('Mira')).toHaveStyle({
      fontFamily: 'BarlowCondensed-Bold',
      fontStyle: 'normal',
    });
  });

  it('keeps body text in the system font even when display fonts have loaded', () => {
    jest.mocked(isLoaded).mockReturnValue(true);
    const { getByText } = render(<GameText>Write your prompt</GameText>);
    expect(getByText('Write your prompt')).not.toHaveStyle({
      fontFamily: 'BarlowCondensed-Bold',
    });
  });
});

describe('game palette contrast', () => {
  it.each([
    ['light', Colors.light],
    ['dark', Colors.dark],
    ['high contrast light', HighContrastColors.light],
    ['high contrast dark', HighContrastColors.dark],
  ] as const)(
    'provides readable semantic text and actions in %s',
    (_, colors) => {
      for (const background of [
        colors.background,
        colors.card,
        colors.fieldSurface,
        colors.selectedSurface,
      ]) {
        for (const ink of [
          colors.text,
          colors.textSecondary,
          colors.textTertiary,
          colors.error,
          colors.success,
          colors.warning,
          colors.info,
        ]) {
          expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(
        contrastRatio(colors.actionInk, colors.actionFill),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(colors.dangerInk, colors.error),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        new Set([
          colors.attack,
          colors.defense,
          colors.finisher,
          colors.primary,
        ]).size,
      ).toBe(4);
    },
  );
});
