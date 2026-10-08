import React from 'react';
import { ScrollView, Text } from 'react-native';
import { render, within } from '@testing-library/react-native';
import { GameScreen } from '@/components/game/GameScreen';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

it('keeps the header and essential footer outside the scrolling content', () => {
  const view = render(
    <GameScreen
      header={<Text>Fixed heading</Text>}
      footer={<Text>Continue</Text>}
    >
      <Text>Scrollable details</Text>
    </GameScreen>,
  );
  expect(view.getByText('Fixed heading')).toBeTruthy();
  expect(view.getByText('Continue')).toBeTruthy();
  const body = within(view.UNSAFE_getByType(ScrollView));
  expect(body.getByText('Scrollable details')).toBeTruthy();
  expect(body.queryByText('Fixed heading')).toBeNull();
  expect(body.queryByText('Continue')).toBeNull();
});
