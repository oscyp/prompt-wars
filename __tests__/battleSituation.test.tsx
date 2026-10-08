import React from 'react';
import { render } from '@testing-library/react-native';
import { BattleSituation } from '@/components/battle/BattleSituation';
jest.mock('@/components/game', () => {
  const { View, Text, Pressable } = jest.requireActual('react-native');
  return {
    GameText: Text,
    GamePanel: ({ children }: any) => (
      <View testID="scene-chrome">{children}</View>
    ),
    GameButton: ({ label, onPress, ...props }: any) => (
      <Pressable {...props} accessibilityLabel={label} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});

it('keeps the full published text reachable from the compact later-step context', () => {
  const situation = {
    id: 'storm-1',
    catalogVersion: 1 as const,
    environmentId: 'storm-citadel',
    text: 'The cable hangs between the supports and the floor is wet.',
  };
  const screen = render(
    <BattleSituation
      situation={situation}
      theme="The calm before the storm"
      compact
      collapsible
    />,
  );
  expect(screen.getByText(situation.text)).toBeTruthy();
  expect(screen.queryByLabelText('Show shared situation')).toBeNull();
  expect(screen.queryByLabelText('Hide shared situation')).toBeNull();
});

it('does not show filters supplied by an older caller', () => {
  const screen = render(
    <BattleSituation
      situation={null}
      affordances={[{ id: 'cable', label: 'Cable' }]}
      onSelectAffordance={jest.fn()}
    />,
  );
  expect(screen.queryByLabelText('All ideas')).toBeNull();
  expect(screen.queryByLabelText('Cable')).toBeNull();
  expect(screen.getByText('Loading the shared situation…')).toBeTruthy();
});
jest.mock('@/components/game/GameDisplayTitle', () => {
  const { Text } = jest.requireActual('react-native');
  return { GameDisplayTitle: Text };
});
jest.mock('@/hooks/useThemedColors', () => ({
  useThemedColors: () => ({ textSecondary: '#888' }),
}));
jest.mock('@/constants/BattleEnvironmentArt', () => ({
  environmentForTheme: () => ({ banner: 1 }),
}));
it('owns one illustrated panel containing the complete authoritative theme and situation', () => {
  const situation = {
    id: 'storm-1',
    catalogVersion: 1 as const,
    environmentId: 'storm-citadel',
    text: 'A long shared situation stays complete beneath the environment banner.',
  };
  const screen = render(
    <BattleSituation
      situation={situation}
      theme="The calm before the storm"
      compact={false}
    />,
  );
  expect(screen.getAllByTestId('scene-chrome')).toHaveLength(1);
  expect(screen.getByText('The calm before the storm')).toBeTruthy();
  expect(screen.getByText(situation.text)).toBeTruthy();
  screen.rerender(
    <BattleSituation
      situation={situation}
      theme="The calm before the storm"
      compact
    />,
  );
  expect(screen.getAllByTestId('scene-chrome')).toHaveLength(1);
  expect(screen.getByText(situation.text)).toBeTruthy();
});
