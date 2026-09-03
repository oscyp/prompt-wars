/**
 * The guard against expo-router's own `router.replace`, which computes the
 * target navigator itself and dispatches from the root ref -- a different
 * code path from `navigation.replace`, and the one the battle screens use.
 */
// jest.setup.js mocks expo-router for every suite; this one needs the real
// router, because the bug it pins lives in how the real router dispatches.
jest.unmock('expo-router');

import React from 'react';
import { Text, Pressable } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
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
      '(battle)/_layout': BattleLayout,
      '(battle)/face-off': FaceOff,
      '(battle)/move-select': MoveSelect,
    },
    { initialUrl: '/(battle)/face-off' },
  );
}

beforeEach(() => mockConfirmLeave.mockClear());

describe('useBattleExitGuard against expo-router', () => {
  it('a bare router.replace is intercepted by the guard', async () => {
    viaExitTo = false;
    mount();
    await screen.findByText('Face-off');
    fireEvent.press(screen.getByLabelText('Continue'));
    await waitFor(() => expect(mockConfirmLeave).toHaveBeenCalledTimes(1));
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
