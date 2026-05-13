import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import {
  Orbitron_700Bold,
  Orbitron_900Black,
} from '@expo-google-fonts/orbitron';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { RevenueCatProvider } from '@/providers/RevenueCatProvider';
import { supabase } from '@/utils/supabase';
import { useThemedColors } from '@/hooks/useThemedColors';

try {
  require('react-native-reanimated');
} catch (e) {
  console.error('Failed to load Reanimated:', e);
}

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore */
});

function RootLayoutNav() {
  const { session, loading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colors = useThemedColors();
  const [checkingOnboarding, setCheckingOnboarding] = React.useState(true);

  useEffect(() => {
    async function checkOnboarding() {
      if (loading || !session || !user) {
        setCheckingOnboarding(false);
        return;
      }

      const { data: character } = await supabase
        .from('characters')
        .select('id')
        .eq('profile_id', user.id)
        .eq('is_active', true)
        .single();

      setCheckingOnboarding(false);

      const inAuthGroup = segments[0] === '(auth)';
      const inOnboardingGroup = segments[0] === '(onboarding)';

      if (session && inAuthGroup) {
        if (character) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/(onboarding)/welcome');
        }
      } else if (session && !inOnboardingGroup && !character) {
        router.replace('/(onboarding)/welcome');
      }
    }

    if (!loading) {
      checkOnboarding();
    }
  }, [session, loading, user, segments, router]);

  useEffect(() => {
    if (loading || checkingOnboarding) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    }
  }, [session, loading, checkingOnboarding, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <Slot />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Orbitron_700Bold,
    Orbitron_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {
        /* ignore */
      });
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A12' }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RevenueCatProvider>
            <RootLayoutNav />
          </RevenueCatProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
