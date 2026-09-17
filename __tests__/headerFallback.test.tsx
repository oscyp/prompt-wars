import React from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Stack } from 'expo-router';
import HeaderBackButton from '@/components/HeaderBackButton';
jest.unmock('expo-router');
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
function Target() {
  return (
    <>
      <HeaderBackButton />
      <Text>Target screen</Text>
    </>
  );
}
test.each([
  ['(profile)/wallet', 'Profile', 'Profile destination'],
  ['(battle)/waiting', 'Arena', 'Arena destination'],
])(
  'cold %s shows its fallback destination and navigates there',
  (path, label, destination) => {
    renderRouter(
      {
        _layout: () => <Stack screenOptions={{ headerShown: false }} />,
        [path]: Target,
        '(tabs)/profile': () => <Text>Profile destination</Text>,
        '(tabs)/home': () => <Text>Arena destination</Text>,
      },
      { initialUrl: `/${path}` },
    );
    fireEvent.press(screen.getByText(label));
    expect(screen.getByText(destination)).toBeTruthy();
  },
);
