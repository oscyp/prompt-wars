import { Stack } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';

export default function ProfileLayout() {
  const colors = useThemedColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="settings" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="stats" />
    </Stack>
  );
}
