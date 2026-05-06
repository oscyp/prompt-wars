import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { RevenueCatProvider } from '@/providers/RevenueCatProvider';
import { supabase } from '@/utils/supabase';

try {
  require('react-native-reanimated');
} catch (e) {
  console.error('Failed to load Reanimated:', e);
}

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { session, loading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [checkingOnboarding, setCheckingOnboarding] = React.useState(true);

  useEffect(() => {
    async function checkOnboarding() {
      if (loading || !session || !user) {
        setCheckingOnboarding(false);
        return;
      }

      // Check if user has an active character
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
        // User just signed in - route based on character existence
        if (character) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/(onboarding)/welcome');
        }
      } else if (session && !inOnboardingGroup && !character) {
        // User is authenticated but has no character and not in onboarding - send to onboarding
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
      // Redirect to sign-in if not authenticated
      router.replace('/(auth)/sign-in');
    }
  }, [session, loading, checkingOnboarding, segments, router]);

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Add custom fonts here if needed
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
