import { Stack } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';
import HeaderBackButton from '@/components/HeaderBackButton';

export default function OnboardingLayout() {
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
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="create-character" />
    </Stack>
  );
}
