import { Stack } from 'expo-router';
import React from 'react';

export default function BattleLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
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
