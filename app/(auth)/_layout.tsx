import { Stack } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';

export default function AuthLayout() {
  const colors = useThemedColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
