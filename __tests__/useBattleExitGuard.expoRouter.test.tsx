/**
 * The guard against expo-router's own `router.replace`, which computes the
 * target navigator itself and dispatches from the root ref -- a different
 * code path from `navigation.replace`, and the one the battle screens use.
 */
// jest.setup.js mocks expo-router for every suite; this one needs the real
// router, because the bug it pins lives in how the real router dispatches.
jest.unmock('expo-router');

import React, { useState } from 'react';
import { Text, Pressable } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Stack, useRouter } from 'expo-router';
import { useBattleExitGuard } from '@/hooks/useBattleExitGuard';

const mockConfirmLeave = jest.fn();

jest.mock('@/hooks/useLeaveBattle', () => ({
  useLeaveBattle: () => ({
    price: 2,
    iHaveLocked: false,
    isLeaving: false,
    confirmLeave: mockConfirmLeave,
  }),
}));

let viaExitTo = true;

function FaceOff() {
  const router = useRouter();
  const leave = useBattleExitGuard('battle-1', {
    format: 'bo3',
    mode: 'bot',
    isBot: true,
    prompts: [],
    myProfileId: 'me',
    enabled: true,
  });
  const go = () => router.replace('/(battle)/move-select');
  return (
    <>
      <Text>Face-off</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue"
        onPress={() => (viaExitTo ? leave.exitTo(go) : go())}
      >
        <Text>Continue</Text>
      </Pressable>
    </>
  );
}

function MoveSelect() {
  return <Text>Move select</Text>;
}

function BattleLayout() {
  return <Stack />;
}

function mount() {
  return renderRouter(
    {
      _layout: BattleLayout,
      '(tabs)/home': () => <Text>Arena home</Text>,
      '(battle)/_layout': BattleLayout,
      '(battle)/face-off': FaceOff,
      '(battle)/move-select': MoveSelect,
    },
    { initialUrl: '/(battle)/face-off' },
  );
}

beforeEach(() => mockConfirmLeave.mockClear());

describe('useBattleExitGuard against expo-router', () => {
  it('an accidental route removal parks safely in Arena', async () => {
    viaExitTo = false;
    mount();
    await screen.findByText('Face-off');
    fireEvent.press(screen.getByLabelText('Continue'));
    await screen.findByText('Arena home');
    expect(mockConfirmLeave).not.toHaveBeenCalled();
    expect(screen.queryByText('Move select')).toBeNull();
  });

  it('router.replace through exitTo lands on the next screen without the dialog', async () => {
    viaExitTo = true;
    mount();
    await screen.findByText('Face-off');
    fireEvent.press(screen.getByLabelText('Continue'));
    await screen.findByText('Move select');
    expect(mockConfirmLeave).not.toHaveBeenCalled();
  });
});

function StatefulArena() {
  const [value, setValue] = useState(0);
  const router = useRouter();
  return (
    <>
      <Text>Arena count {value}</Text>
      <Pressable
        accessibilityLabel="Increment"
        onPress={() => setValue((v) => v + 1)}
      >
        <Text>Add</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Open battle"
        onPress={() => router.push('/(battle)/face-off')}
      >
        <Text>Open</Text>
      </Pressable>
    </>
  );
}
it('parking a pushed battle preserves the existing Arena state', async () => {
  viaExitTo = false;
  renderRouter(
    {
      _layout: BattleLayout,
      '(tabs)/home': StatefulArena,
      '(battle)/_layout': BattleLayout,
      '(battle)/face-off': FaceOff,
      '(battle)/move-select': MoveSelect,
    },
    { initialUrl: '/(tabs)/home' },
  );
  await screen.findByText('Arena count 0');
  fireEvent.press(screen.getByLabelText('Increment'));
  fireEvent.press(screen.getByLabelText('Open battle'));
  await screen.findByText('Face-off');
  fireEvent.press(screen.getByLabelText('Continue'));
  await screen.findByText('Arena count 1');
});
