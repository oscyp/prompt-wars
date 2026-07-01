import { Stack } from 'expo-router';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import HeaderBackButton from '@/components/HeaderBackButton';
import { ForcedColorSchemeProvider } from '@/hooks/useThemedColors';

export default function BattleLayout() {
  // The battle / reveal flow is a cinematic surface: force the dark canvas
  // regardless of the app's light/dark setting so reveals never render weak on
  // a light theme. Utility screens outside this group keep following the system.
  return (
    <ForcedColorSchemeProvider scheme="dark">
      <StatusBar style="light" />
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
        <Stack.Screen name="matchmaking" />
        <Stack.Screen
          name="face-off"
          options={{ gestureEnabled: false, headerShown: false }}
        />
        <Stack.Screen name="prompt-entry" />
        <Stack.Screen name="waiting" />
        <Stack.Screen
          name="round-result"
          options={{ gestureEnabled: false, animation: 'fade' }}
        />
        <Stack.Screen name="result" />
      </Stack>
    </ForcedColorSchemeProvider>
  );
}
