import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth, useRouteGate } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import BrandMark from '@/components/game/BrandMark';
import { GameFeedback } from '@/components/game/GameFeedback';

/**
 * Root index: waits for the auth/character gate, then redirects once.
 *
 * It used to redirect to sign-in unconditionally and let `_layout.tsx` bounce
 * signed-in players onward, which flashed the sign-in form at every returning
 * player on every cold start.
 */
export default function Index() {
  const {
    session,
    loading,
    restorationError,
    recoveryPending,
    recoveryProcessing,
    eligibility,
    eligibilityError,
  } = useAuth();
  const gate = useRouteGate();
  const colors = useThemedColors();

  if (restorationError) return null;

  if (loading || recoveryProcessing || !gate.resolved) {
    return (
      <View style={[styles.holding, { backgroundColor: colors.background }]}>
        <BrandMark kind="emblem" size={104} />
        <BrandMark size={240} />
        <GameFeedback
          icon="arena"
          title="Opening your Arena…"
          busy
          layout="inline"
        />
      </View>
    );
  }

  if (!session)
    return (
      <Redirect
        href={
          process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED === '1' ||
          process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED === '1'
            ? '/(auth)/entry'
            : '/(auth)/sign-in'
        }
      />
    );
  if (recoveryPending) return <Redirect href="/(auth)/reset-password" />;
  if (
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED === '1' &&
    (eligibilityError || !eligibility?.can_play)
  )
    return <Redirect href="/(auth)/eligibility" />;
  return (
    <Redirect
      href={gate.hasCharacter ? '/(tabs)/home' : '/(onboarding)/welcome'}
    />
  );
}

const styles = StyleSheet.create({
  holding: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    padding: 24,
  },
});
