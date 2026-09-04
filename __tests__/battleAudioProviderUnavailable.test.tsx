import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import {
  BattleAudioProvider,
  useBattleAudio,
} from '@/providers/BattleAudioProvider';

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn(() => null),
}));

jest.mock('expo-audio', () => {
  throw new Error(
    'expo-audio must not load without the ExpoAudio native module',
  );
});

function Harness() {
  useBattleAudio('A city under neon rain');
  return <Text>Battle route rendered</Text>;
}

it('keeps battle routes usable when an older client lacks ExpoAudio', () => {
  const view = render(
    <BattleAudioProvider>
      <Harness />
    </BattleAudioProvider>,
  );

  expect(view.getByText('Battle route rendered')).toBeTruthy();
});
