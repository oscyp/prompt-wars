import { Stack } from 'expo-router';
import React from 'react';
import HeaderBackButton from '@/components/HeaderBackButton';

export default function BattleLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerTitle: '',
        headerShadowVisible: false,
        headerBackTitle: '',
        headerLeft: () => <HeaderBackButton />,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="matchmaking" />
      <Stack.Screen
        name="face-off"
        options={{ gestureEnabled: false, headerShown: false }}
      />
      <Stack.Screen name="prompt-entry" />
      <Stack.Screen name="waiting" />
      <Stack.Screen
        name="round-result"
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
      <Stack.Screen name="result" />
    </Stack>
  );
}
