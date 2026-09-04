import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import {
  AuthProvider,
  RouteGateContext,
  useAuth,
  type RouteGateState,
} from '@/providers/AuthProvider';
import { RevenueCatProvider } from '@/providers/RevenueCatProvider';
import { supabase } from '@/utils/supabase';
import { useEffectiveColorScheme } from '@/hooks/useThemedColors';
import { loadAudioPreferences } from '@/utils/audioSettings';
import {
  addNotificationResponseListener,
  handleInitialNotification,
  registerForPushNotifications,
} from '@/utils/notifications';

try {
  require('react-native-reanimated');
} catch (e) {
  console.error('Failed to load Reanimated:', e);
}

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

/**
 * The splash is held until auth and the character check have both answered,
 * so a signed-in player never sees the sign-in screen flash past. If either
 * hangs (no network on a cold start), this lets the app reveal anyway; the
 * index route keeps showing its own spinner until the gate resolves.
 */
const SPLASH_FAILSAFE_MS = 6000;

function RootLayoutNav() {
  const { session, loading, recoveryPending } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useEffectiveColorScheme();

  // Keyed on the id, not the session object: every token refresh mints a new
  // Session, and effects keyed on it re-ran the character query and re-fired
  // the cold-start notification handler on each refresh.
  const userId = session?.user?.id ?? null;
  const inAuthGroup = segments[0] === '(auth)';
  const inOnboardingGroup = segments[0] === '(onboarding)';
  const onResetScreen = inAuthGroup && segments[1] === 'reset-password';

  const [checking, setChecking] = useState(true);
  const [hasCharacter, setHasCharacter] = useState<boolean | null>(null);
  const lastKnown = useRef<boolean | null>(null);

  useEffect(() => {
    if (loading) return;

    if (!userId) {
      lastKnown.current = null;
      setHasCharacter(null);
      setChecking(false);
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      return;
    }

    if (recoveryPending) {
      // A recovery session may only set a password. Nothing else is reachable
      // until the reset screen ends it.
      setChecking(false);
      if (!onResetScreen) router.replace('/(auth)/reset-password');
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      // A row that exists but was never finalized is an abandoned creation
      // draft, not a fighter. finalized_at is server-owned (the guard trigger
      // refuses to clear it), so it is the one marker a client cannot forge.
      const { data, error } = await supabase
        .from('characters')
        .select('id')
        .eq('profile_id', userId)
        .eq('is_active', true)
        .not('finalized_at', 'is', null)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      let has: boolean;
      if (error) {
        // Keep the last answer rather than demoting a known fighter to
        // onboarding on a flaky read. First-load failures fall back to
        // onboarding, where a real character surfaces as a create conflict.
        console.warn('Character check failed:', error.message);
        has = lastKnown.current ?? false;
      } else {
        has = Boolean(data);
      }
      lastKnown.current = has;
      setHasCharacter(has);
      setChecking(false);

      if (inAuthGroup) {
        router.replace(has ? '/(tabs)/home' : '/(onboarding)/welcome');
      } else if (!has && !inOnboardingGroup) {
        router.replace('/(onboarding)/welcome');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    loading,
    inAuthGroup,
    inOnboardingGroup,
    onResetScreen,
    recoveryPending,
    router,
  ]);

  const resolved = !loading && !checking;

  useEffect(() => {
    if (resolved) SplashScreen.hideAsync().catch(() => {});
  }, [resolved]);

  useEffect(() => {
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Push registration and notification routing wait for a finalized character.
  // Asking for permission on the sign-in screen, before the player has anything
  // to be notified about, was the single biggest cause of denied prompts.
  useEffect(() => {
    if (!userId || hasCharacter !== true) return;
    registerForPushNotifications(userId);
    handleInitialNotification();
    const subscription = addNotificationResponseListener();
    return () => subscription.remove();
  }, [userId, hasCharacter]);

  const gate = useMemo<RouteGateState>(
    () => ({ resolved, hasCharacter }),
    [resolved, hasCharacter],
  );

  return (
    <RouteGateContext.Provider value={gate}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Slot />
    </RouteGateContext.Provider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Add custom fonts here if needed
  });

  // Hydrate battle-audio preferences before the first reveal.
  useEffect(() => {
    void loadAudioPreferences();
  }, []);

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
