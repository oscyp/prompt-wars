/**
 * The guard against a REAL navigator, not a mocked usePreventRemove.
 *
 * The unit test pins the render ordering the hook relies on; this one proves
 * the ordering is enough for React Navigation itself: a replace issued through
 * `exitTo` must land on the next screen without the leave dialog, and a bare
 * replace must still be intercepted.
 */
import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import {
  NavigationContainer,
  useNavigation as useRNNavigation,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useBattleExitGuard } from '@/hooks/useBattleExitGuard';

const mockConfirmLeave = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => {
    // The hook imports useNavigation from expo-router; in this harness the
    // React Navigation one is the same object.
    const { useNavigation } = jest.requireActual('@react-navigation/native');
    return useNavigation();
  },
}));

jest.mock('@/hooks/useLeaveBattle', () => ({
  useLeaveBattle: () => ({
    price: 2,
    iHaveLocked: false,
    isLeaving: false,
    confirmLeave: mockConfirmLeave,
  }),
}));

const Stack = createNativeStackNavigator();

function FaceOff({ viaExitTo }: { viaExitTo: boolean }) {
  const navigation = useRNNavigation<any>();
  const leave = useBattleExitGuard('battle-1', {
    format: 'bo3',
    mode: 'bot',
    isBot: true,
    prompts: [],
    myProfileId: 'me',
    enabled: true,
  });
  const go = () => navigation.replace('MoveSelect');
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

function App({ viaExitTo }: { viaExitTo: boolean }) {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="FaceOff">
          {() => <FaceOff viaExitTo={viaExitTo} />}
        </Stack.Screen>
        <Stack.Screen name="MoveSelect" component={MoveSelect} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

beforeEach(() => mockConfirmLeave.mockClear());

describe('useBattleExitGuard against a real navigator', () => {
  it('a bare replace is intercepted by the guard', async () => {
    const { getByLabelText, queryByText } = render(<App viaExitTo={false} />);
    fireEvent.press(getByLabelText('Continue'));
    await waitFor(() => expect(mockConfirmLeave).toHaveBeenCalledTimes(1));
    expect(queryByText('Move select')).toBeNull();
  });

  it('a replace through exitTo lands on the next screen without the dialog', async () => {
    const { getByLabelText, findByText } = render(<App viaExitTo />);
    fireEvent.press(getByLabelText('Continue'));
    await findByText('Move select');
    expect(mockConfirmLeave).not.toHaveBeenCalled();
  });
});
