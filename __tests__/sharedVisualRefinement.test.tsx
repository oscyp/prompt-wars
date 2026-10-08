import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CreditAmount } from '@/components/game/CreditAmount';
import { GameButton, GameHeader, GameScreen } from '@/components/game';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

it('distinguishes zero, unknown and signed currency with one spoken unit', () => {
  const view = render(<CreditAmount amount={0} />);
  expect(view.getByLabelText('0 credits')).toBeTruthy();
  expect(view.getByText('0')).toBeTruthy();
  view.rerender(<CreditAmount amount={null} />);
  expect(view.getByLabelText('Credits unavailable')).toBeTruthy();
  expect(view.queryByText('0')).toBeNull();
  view.rerender(<CreditAmount amount={-4} signed />);
  expect(view.getByLabelText('Minus 4 credits')).toBeTruthy();
  expect(view.getByText('−4')).toBeTruthy();
});

it('composes a priced button without losing its price in accessibility', () => {
  const onPress = jest.fn();
  const view = render(
    <GameButton label="Review & draw" amount={3} onPress={onPress} />,
  );
  fireEvent.press(
    view.getByRole('button', { name: 'Review & draw, 3 credits' }),
  );
  expect(onPress).toHaveBeenCalledTimes(1);
  view.rerender(
    <GameButton label="Review & draw" amount={null} onPress={onPress} />,
  );
  fireEvent.press(
    view.getByRole('button', { name: 'Review & draw, credits unavailable' }),
  );
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('renders one compact heading with independent leading and balance controls', () => {
  const view = render(
    <GameHeader
      presentation="secondary"
      title="Very long wallet heading"
      leading={<GameButton label="Back" />}
      trailing={<GameButton label="Wallet" amount={1000000} />}
    />,
  );
  expect(view.getAllByRole('header')).toHaveLength(1);
  expect(view.getByRole('button', { name: 'Back' })).toBeTruthy();
  expect(
    view.getByRole('button', { name: 'Wallet, 1,000,000 credits' }),
  ).toBeTruthy();
  expect(view.getByRole('header').props.numberOfLines).toBeUndefined();
});

it('renders a decorative background outside its safe-area content', () => {
  const view = render(
    <GameScreen
      background={<View testID="environment" />}
      header={<Text>Navigation</Text>}
    >
      <Text>Body</Text>
    </GameScreen>,
  );
  expect(
    view.getByTestId('environment', { includeHiddenElements: true }),
  ).toBeTruthy();
  const background = view.getByTestId('game-screen-background', {
    includeHiddenElements: true,
  });
  expect(background.props.pointerEvents).toBe('none');
  expect(background.props.accessibilityElementsHidden).toBe(true);
  expect(view.getByText('Navigation')).toBeTruthy();
});
