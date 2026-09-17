import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GameButton } from '@/components/game/GameButton';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { contrastRatio } from '@/utils/contrast';
import { Colors } from '@/constants/Colors';
import { StyleSheet } from 'react-native';

jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));

it('preserves standalone legacy icon labels and explicit decorative exclusion', () => {
  const screen = render(
    <GameSymbol name="trophy" accessibilityLabel="Winner" />,
  );
  expect(screen.getByLabelText('Winner').props.accessible).toBe(true);
  screen.rerender(
    <GameSymbol name="trophy" accessibilityLabel="Winner" accessible={false} />,
  );
  expect(screen.getByLabelText('Winner').props.accessible).toBe(false);
});

it('custom glyphs stay decorative while their action retains its name and selected marker', () => {
  const onPress = jest.fn();
  const view = render(
    <GameButton
      label="Customize"
      gameIcon="hanger"
      selected
      onPress={onPress}
    />,
  );
  fireEvent.press(view.getByRole('button', { name: 'Customize' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(view.getByRole('button').props.accessibilityState.selected).toBe(true);
  expect(
    view.getByTestId('game-icon-hanger', { includeHiddenElements: true }).props
      .accessible,
  ).toBe(false);
  expect(
    view.getByTestId('game-icon-check', { includeHiddenElements: true }),
  ).toBeTruthy();
});

it('does not allow a custom icon or text chrome to bypass busy blocking', () => {
  const onPress = jest.fn();
  const view = render(
    <GameButton
      label="Check again"
      gameIcon="replay"
      chrome="text"
      busy
      onPress={onPress}
    />,
  );
  fireEvent.press(view.getByRole('button', { name: 'Check again' }));
  expect(onPress).not.toHaveBeenCalled();
  expect(view.getByRole('button').props.accessibilityState).toMatchObject({
    busy: true,
    disabled: true,
  });
});

it('renders distinct move silhouettes without exposing unlabeled controls', () => {
  const view = render(
    <>
      <GameIcon name="attack" />
      <GameIcon name="defense" />
      <GameIcon name="finisher" />
    </>,
  );
  for (const name of ['attack', 'defense', 'finisher']) {
    expect(
      view.getByTestId(`game-icon-${name}`, { includeHiddenElements: true })
        .props.accessible,
    ).toBe(false);
  }
  expect(view.queryAllByRole('button')).toHaveLength(0);
});

it.each(['primary', 'danger'] as const)(
  'keeps enabled %s text actions readable without a filled surface',
  (tone) => {
    const view = render(
      <GameButton label="Confirm" chrome="text" tone={tone} />,
    );
    const ink = StyleSheet.flatten(view.getByText('Confirm').props.style).color;
    expect(contrastRatio(ink, Colors.dark.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(ink, Colors.dark.card)).toBeGreaterThanOrEqual(4.5);
  },
);
