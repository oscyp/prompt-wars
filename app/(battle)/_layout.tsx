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
      <Stack.Screen name="prompt-entry" />
      <Stack.Screen name="waiting" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
