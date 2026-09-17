import React, { useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ArenaTabBar from '@/components/ArenaTabBar';
import * as Game from '@/components/game';

jest.mock('expo-font', () => ({ isLoaded: () => true }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/utils/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 320, height: 568, scale: 1, fontScale: 2 }),
}));
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

const Tab = createBottomTabNavigator();
function Arena() {
  const [value, setValue] = useState('');
  return (
    <TextInput
      accessibilityLabel="Test arena draft"
      value={value}
      onChangeText={setValue}
    />
  );
}
function BattleList() {
  return <Text>Battle list content</Text>;
}
function Empty() {
  return <View />;
}
function Harness({
  onBattle = jest.fn(),
  onTabPress,
  onLongPress,
}: {
  onBattle?: () => void;
  onTabPress?: (event: any) => void;
  onLongPress?: () => void;
}) {
  const buttonRef = useRef<View>(null);
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{ headerShown: false, animation: 'none' }}
        tabBar={(props) => (
          <ArenaTabBar
            {...props}
            onBattle={onBattle}
            battleActionRef={buttonRef}
          />
        )}
      >
        <Tab.Screen
          name="home"
          component={Arena}
          options={{ title: 'Arena' }}
        />
        <Tab.Screen
          name="battles"
          component={BattleList}
          options={{ title: 'Battles', tabBarBadge: 9 }}
          listeners={{ tabPress: onTabPress, tabLongPress: onLongPress }}
        />
        <Tab.Screen
          name="rankings"
          component={Empty}
          options={{ title: 'Rankings' }}
        />
        <Tab.Screen
          name="profile"
          component={Empty}
          options={{ title: 'Profile' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

it('uses scalable display labels and grows the bar for wrapped navigation text', () => {
  const view = render(<Harness />);
  const label = view.getByText('Rankings');
  expect(label).toHaveStyle({ fontFamily: 'BarlowCondensed-Bold' });
  expect(label.props.allowFontScaling).toBe(true);
  expect(label.props.numberOfLines).toBeUndefined();
  fireEvent(label, 'textLayout', {
    nativeEvent: {
      lines: [
        { y: 0, height: 32 },
        { y: 32, height: 32 },
        { y: 64, height: 32 },
      ],
    },
  });
  expect(
    StyleSheet.flatten(view.getByTestId('arena-tab-bar').props.style).minHeight,
  ).toBeGreaterThanOrEqual(170);
});

it('keeps navigation events, current selection and screen state when using Battle', async () => {
  const onBattle = jest.fn();
  const onLongPress = jest.fn();
  const view = render(
    <Harness onBattle={onBattle} onLongPress={onLongPress} />,
  );
  fireEvent.changeText(
    view.getByLabelText('Test arena draft'),
    'A retained idea',
  );
  expect(
    view.getByRole('button', { name: 'Arena', selected: true }),
  ).toBeTruthy();
  fireEvent.press(view.getByText('Battles'));
  await view.findByText('Battle list content');
  expect(
    view.getByRole('button', {
      name: 'Battles, 9 battles requiring attention',
      selected: true,
    }),
  ).toBeTruthy();
  fireEvent.press(view.getByLabelText('Start a battle'));
  expect(onBattle).toHaveBeenCalledTimes(1);
  expect(view.getByText('Battle list content')).toBeTruthy();
  fireEvent(view.getByText('Battles'), 'longPress');
  expect(onLongPress).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByText('Arena'));
  await waitFor(() =>
    expect(view.getByLabelText('Test arena draft').props.value).toBe(
      'A retained idea',
    ),
  );
});

it('honors a prevented tab press', () => {
  const view = render(
    <Harness onTabPress={(event) => event.preventDefault()} />,
  );
  fireEvent.press(view.getByText('Battles'));
  expect(view.getByLabelText('Test arena draft')).toBeTruthy();
  expect(view.queryByText('Battle list content')).toBeNull();
});

it('provides a complete labelled menu action with a single accessible target', () => {
  expect(Game).toHaveProperty('GameNavRow');
  const Row = Game.GameNavRow;
  const onPress = jest.fn();
  const title = 'Wallet, Abonnement · 李小龍 · Łucja García';
  const view = render(
    <Row
      title={title}
      description="A complete description that can wrap"
      icon="wallet-outline"
      onPress={onPress}
    />,
  );
  const button = view.getByRole('button', { name: title });
  expect(button).toHaveStyle({ minHeight: 64 });
  expect(view.getByText(title).props.numberOfLines).toBeUndefined();
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
  view.rerender(
    <Row title={title} icon="wallet-outline" onPress={onPress} busy />,
  );
  expect(view.getByRole('button').props.accessibilityState).toMatchObject({
    busy: true,
    disabled: true,
  });
  fireEvent.press(view.getByRole('button'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('exposes links separately and suppresses disabled menu actions', () => {
  const onPress = jest.fn();
  const view = render(
    <Game.GameNavRow
      title="Privacy policy"
      icon="lock-closed-outline"
      role="link"
      inline
      onPress={onPress}
    />,
  );
  fireEvent.press(view.getByRole('link', { name: 'Privacy policy' }));
  expect(onPress).toHaveBeenCalledTimes(1);
  view.rerender(
    <Game.GameNavRow
      title="Privacy policy"
      icon="lock-closed-outline"
      role="link"
      inline
      onPress={onPress}
      disabled
    />,
  );
  expect(view.getByRole('link')).toBeDisabled();
  fireEvent.press(view.getByRole('link'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
