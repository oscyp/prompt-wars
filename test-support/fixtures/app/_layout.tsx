import React from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text, View } from 'react-native';

export default function FixtureLayout() {
  const skipFonts = process.env.EXPO_PUBLIC_FIXTURE_SKIP_FONTS === '1';
  const [loaded, error] = useFonts(
    skipFonts
      ? {}
      : {
          'BarlowCondensed-Bold': require('@/assets/fonts/BarlowCondensed-Bold.ttf'),
          'BarlowCondensed-ExtraBoldItalic': require('@/assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf'),
        },
  );
  if (!loaded && !error)
    return (
      <View>
        <Text>Loading local fixture fonts…</Text>
      </View>
    );
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0B13' },
        }}
      />
    </SafeAreaProvider>
  );
}
