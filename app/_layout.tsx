import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  Stack,
  useRouter,
  useSegments,
  useGlobalSearchParams,
} from 'expo-router';
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
import {
  useEffectiveColorScheme,
  useThemedColors,
} from '@/hooks/useThemedColors';
import { GameFeedback } from '@/components/game/GameFeedback';
import { loadAudioPreferences } from '@/utils/audioSettings';
import {
  addNotificationResponseListener,
  handleInitialNotification,
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
  const {
    session,
    loading,
    restorationError,
    retrySessionRestore,
    recoveryPending,
    recoveryProcessing,
    eligibility,
    eligibilityLoading,
    eligibilityError,
  } = useAuth();
  const segments = useSegments();
  const { switchAccount } = useGlobalSearchParams<{ switchAccount?: string }>();
  const router = useRouter();
  const colorScheme = useEffectiveColorScheme();
  const colors = useThemedColors();

  // Keyed on the id, not the session object: every token refresh mints a new
  // Session, and effects keyed on it re-ran the character query and re-fired
  // the cold-start notification handler on each refresh.
  const userId = session?.user?.id ?? null;
  const inAuthGroup = segments[0] === '(auth)';
  const inOnboardingGroup = segments[0] === '(onboarding)';
  const onResetScreen = inAuthGroup && segments[1] === 'reset-password';
  const onGuestAccountSwitch =
    inAuthGroup &&
    segments[1] === 'sign-in' &&
    switchAccount === '1' &&
    session?.user.is_anonymous === true;
  const onEligibilityScreen = inAuthGroup && segments[1] === 'eligibility';
  const onAccountManagement =
    segments[0] === '(profile)' &&
    ['settings', 'blocked'].includes(segments[1]);
  const requiresEligibility =
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED === '1' && !!userId;
  const waitingForEligibility =
    requiresEligibility &&
    (eligibilityLoading || (!eligibility && !eligibilityError));
  const accessAllowed =
    !requiresEligibility ||
    (!waitingForEligibility &&
      !eligibilityError &&
      eligibility?.can_play === true);

  const [characterCheck, setCharacterCheck] = useState<{
    accountId: string | null;
    checking: boolean;
    hasCharacter: boolean | null;
    error: boolean;
  }>({ accountId: null, checking: true, hasCharacter: null, error: false });
  const [retryCheck, setRetryCheck] = useState(0);
  const lastKnown = useRef<{ accountId: string; hasCharacter: boolean } | null>(
    null,
  );
  // Derive the visible gate from the account in this render. Waiting for an
  // effect to clear old state would let notification routing see A's fighter
  // together with B's user id during a direct account switch.
  const canCheckCharacter =
    !loading &&
    !restorationError &&
    !!userId &&
    !recoveryPending &&
    !recoveryProcessing &&
    accessAllowed;
  const ownsCheck = characterCheck.accountId === userId;
  const hasCharacter =
    canCheckCharacter && ownsCheck ? characterCheck.hasCharacter : null;
  const checking = canCheckCharacter && (!ownsCheck || characterCheck.checking);
  const characterError = canCheckCharacter && ownsCheck && characterCheck.error;

  useEffect(() => {
    if (loading || restorationError || recoveryProcessing) return;

    if (!userId) {
      lastKnown.current = null;
      setCharacterCheck({
        accountId: null,
        hasCharacter: null,
        checking: false,
        error: false,
      });
      if (!inAuthGroup)
        router.replace(
          process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED === '1' ||
            process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED === '1'
            ? '/(auth)/entry'
            : '/(auth)/sign-in',
        );
      return;
    }

    if (recoveryPending) {
      // A recovery session may only set a password. Nothing else is reachable
      // until the reset screen ends it.
      lastKnown.current = null;
      setCharacterCheck({
        accountId: userId,
        hasCharacter: null,
        checking: false,
        error: false,
      });
      if (!onResetScreen) router.replace('/(auth)/reset-password');
      return;
    }

    if (!accessAllowed) {
      lastKnown.current = null;
      setCharacterCheck({
        accountId: userId,
        hasCharacter: null,
        checking: false,
        error: false,
      });
      if (
        !waitingForEligibility &&
        !onEligibilityScreen &&
        !onAccountManagement &&
        !onGuestAccountSwitch
      )
        router.replace('/(auth)/eligibility');
      return;
    }

    let cancelled = false;
    if (lastKnown.current?.accountId !== userId) lastKnown.current = null;
    setCharacterCheck((previous) => ({
      accountId: userId,
      hasCharacter:
        previous.accountId === userId ? previous.hasCharacter : null,
      checking: true,
      error: false,
    }));

    (async () => {
      // A row that exists but was never finalized is an abandoned creation
      // draft, not a fighter. finalized_at is server-owned (the guard trigger
      // refuses to clear it), so it is the one marker a client cannot forge.
      const { data, error } = await (async () => {
        try {
          return await supabase
            .from('characters')
            .select('id')
            .eq('profile_id', userId)
            .eq('is_active', true)
            .not('finalized_at', 'is', null)
            .limit(1)
            .maybeSingle();
        } catch (error) {
          return {
            data: null,
            error: {
              message:
                error instanceof Error
                  ? error.message
                  : 'Character request failed',
            },
          };
        }
      })();

      if (cancelled) return;

      let has: boolean;
      if (error) {
        // A flaky read may retain only this account's last confirmed answer.
        // Without one, keep routing unresolved and expose Retry.
        console.warn('Character check failed:', error.message);
        if (lastKnown.current?.accountId !== userId) {
          setCharacterCheck({
            accountId: userId,
            hasCharacter: null,
            checking: false,
            error: true,
          });
          return;
        }
        has = lastKnown.current.hasCharacter;
      } else {
        has = Boolean(data);
      }
      lastKnown.current = { accountId: userId, hasCharacter: has };
      setCharacterCheck({
        accountId: userId,
        hasCharacter: has,
        checking: false,
        error: false,
      });

      if (inAuthGroup && !onGuestAccountSwitch) {
        router.replace(has ? '/(tabs)/home' : '/(onboarding)/welcome');
      } else if (
        !has &&
        !inOnboardingGroup &&
        !onAccountManagement &&
        !onGuestAccountSwitch
      ) {
        router.replace('/(onboarding)/welcome');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    retryCheck,
    loading,
    restorationError,
    onGuestAccountSwitch,
    inAuthGroup,
    inOnboardingGroup,
    onResetScreen,
    recoveryPending,
    recoveryProcessing,
    accessAllowed,
    waitingForEligibility,
    onEligibilityScreen,
    onAccountManagement,
    router,
  ]);

  const resolved =
    !loading &&
    !restorationError &&
    !recoveryProcessing &&
    (recoveryPending || !waitingForEligibility) &&
    !checking &&
    !characterError;

  useEffect(() => {
    if (resolved || characterError || restorationError)
      SplashScreen.hideAsync().catch(() => {});
  }, [resolved, characterError, restorationError]);

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
      <View
        style={{ flex: 1 }}
        pointerEvents={loading || restorationError ? 'none' : 'auto'}
        accessibilityElementsHidden={loading || restorationError}
        importantForAccessibility={
          loading || restorationError ? 'no-hide-descendants' : 'auto'
        }
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(battle)" />
          <Stack.Screen name="(profile)" />
        </Stack>
      </View>
      {(loading || restorationError) && (
        <View
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: colors.background,
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <GameFeedback
            icon="shield-check"
            title={
              loading
                ? 'Restoring your progress…'
                : 'Could not restore your progress'
            }
            busy={loading}
            message={
              loading
                ? undefined
                : 'Check your connection and retry. Your saved account must be restored before you can continue.'
            }
            action={
              loading
                ? undefined
                : {
                    label: 'Retry',
                    onPress: () => void retrySessionRestore(),
                  }
            }
          />
        </View>
      )}
      {waitingForEligibility &&
        !loading &&
        !restorationError &&
        !recoveryPending &&
        !recoveryProcessing &&
        !onAccountManagement &&
        !onGuestAccountSwitch &&
        !onEligibilityScreen && (
          <View
            accessibilityViewIsModal
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: colors.background,
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <GameFeedback
              icon="shield-check"
              title="Checking account access…"
              message="Your account stays protected while we check."
              busy
            />
          </View>
        )}
      {characterError && !onAccountManagement && !onGuestAccountSwitch && (
        <View
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: colors.background,
            justifyContent: 'center',
            padding: 24,
            gap: 16,
          }}
        >
          <GameFeedback
            icon="shield-check"
            title="Couldn’t check your fighter"
            message="Check your connection and retry to continue."
            action={{
              label: 'Retry',
              onPress: () => setRetryCheck((value) => value + 1),
            }}
          />
        </View>
      )}
    </RouteGateContext.Provider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'BarlowCondensed-Bold': require('../assets/fonts/BarlowCondensed-Bold.ttf'),
    'BarlowCondensed-ExtraBoldItalic': require('../assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf'),
  });
  const [fontWaitExpired, setFontWaitExpired] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    const timer = setTimeout(() => setFontWaitExpired(true), 3000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  // Hydrate battle-audio preferences before the first reveal.
  useEffect(() => {
    void loadAudioPreferences();
  }, []);

  if (!fontsLoaded && !fontError && !fontWaitExpired) {
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
