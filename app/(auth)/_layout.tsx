import { Stack } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';
import HeaderBackButton from '@/components/HeaderBackButton';

export default function AuthLayout() {
  const colors = useThemedColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitle: '',
        headerShadowVisible: false,
        headerBackTitle: '',
        headerLeft: () => <HeaderBackButton />,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="entry" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" />
      {/* Reached from a recovery deep link, so usually with no back stack; the
          back button hides itself in that case. */}
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
