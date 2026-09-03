import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth, useRouteGate } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';

/**
 * Root index: waits for the auth/character gate, then redirects once.
 *
 * It used to redirect to sign-in unconditionally and let `_layout.tsx` bounce
 * signed-in players onward, which flashed the sign-in form at every returning
 * player on every cold start.
 */
export default function Index() {
  const { session, loading, recoveryPending } = useAuth();
  const gate = useRouteGate();
  const colors = useThemedColors();

  if (loading || !gate.resolved) {
    return (
      <View style={[styles.holding, { backgroundColor: colors.background }]}>
        <ActivityIndicator
          color={colors.primary}
          size="large"
          accessibilityLabel="Loading"
        />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (recoveryPending) return <Redirect href="/(auth)/reset-password" />;
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
  },
});
