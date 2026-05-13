import { Stack } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';

export default function BattleLayout() {
  const colors = useThemedColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade_from_bottom',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="matchmaking" />
      <Stack.Screen name="prompt-entry" />
      <Stack.Screen name="waiting" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
