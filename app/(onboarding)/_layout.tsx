import { Stack } from 'expo-router';
import React from 'react';
import HeaderBackButton from '@/components/HeaderBackButton';

export default function OnboardingLayout() {
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
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="create-character" />
    </Stack>
  );
}
