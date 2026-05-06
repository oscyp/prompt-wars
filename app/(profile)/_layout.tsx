import { Stack } from 'expo-router';
import React from 'react';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="settings" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="stats" />
    </Stack>
  );
}
