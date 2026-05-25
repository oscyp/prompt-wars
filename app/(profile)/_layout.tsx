import { Stack } from 'expo-router';
import React from 'react';
import HeaderBackButton from '@/components/HeaderBackButton';

export default function ProfileLayout() {
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
      <Stack.Screen name="settings" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="stats" />
      <Stack.Screen name="edit-character" />
    </Stack>
  );
}
