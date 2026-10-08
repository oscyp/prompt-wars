import { Stack } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';
import { SecondaryScreenHeader } from '@/components/game/ScreenHeaders';

export default function ProfileLayout() {
  const colors = useThemedColors();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: false,
        headerStyle: { backgroundColor: colors.background },
        header: ({ options }) => (
          <SecondaryScreenHeader title={options.title ?? ''} />
        ),
        headerShadowVisible: false,
        headerBackTitle: '',
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="wallet" options={{ title: 'Wallet' }} />
      <Stack.Screen name="stats" options={{ title: 'Stats' }} />
      <Stack.Screen name="edit-character" options={{ title: 'Edit Look' }} />
      <Stack.Screen name="shop" options={{ title: 'Cosmetic Shop' }} />
      <Stack.Screen name="blocked" options={{ title: 'Blocked users' }} />
    </Stack>
  );
}
