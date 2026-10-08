import React, { useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { RegistrationForm } from '@/components/auth/RegistrationForm';
import { GameButton, GamePanel, GameText } from '@/components/game';
import { GameFeedback } from '@/components/game/GameFeedback';
import { confirmGuestExit } from '@/utils/guestAccount';
import { Links } from '@/constants/Links';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAuth } from '@/providers/AuthProvider';

export default function EligibilityScreen() {
  const {
    user,
    loading,
    recoveryPending,
    recoveryProcessing,
    eligibility,
    eligibilityLoading,
    eligibilityError,
    refreshEligibility,
    signOut,
  } = useAuth();
  const currentUser = useRef(user);
  currentUser.current = user;
  const colors = useThemedColors();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  if (!loading && !user) return <Redirect href="/(auth)/sign-in" />;
  if (recoveryPending) return <Redirect href="/(auth)/reset-password" />;
  if (process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED !== '1')
    return <Redirect href="/" />;
  if (eligibility?.can_play && !eligibilityLoading && !eligibilityError)
    return <Redirect href="/" />;

  const waiting =
    loading ||
    recoveryProcessing ||
    eligibilityLoading ||
    (!eligibility && !eligibilityError);
  const needsRegistration =
    !waiting &&
    !eligibilityError &&
    eligibility?.status === 'needs_registration';
  const leave = async () => {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {needsRegistration && user ? (
        <RegistrationForm
          key={user.id}
          existingAccountId={user.id}
          onComplete={refreshEligibility}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <GamePanel style={styles.panel}>
            <GameFeedback
              icon="shield-check"
              title={
                waiting
                  ? 'Checking your account…'
                  : eligibilityError
                    ? 'Could not check your account'
                    : 'Your account is restricted'
              }
              busy={waiting}
              message={
                waiting
                  ? undefined
                  : eligibilityError
                    ? 'Check your connection and try again. Account management is still available.'
                    : eligibility?.status === 'deleted'
                      ? 'This account has been deleted. You can contact support for help.'
                      : 'Play is unavailable because required consent was withdrawn or this account is restricted. You can manage or delete your account, or contact support for help.'
              }
              action={
                eligibilityError
                  ? { label: 'Retry', onPress: () => void refreshEligibility() }
                  : undefined
              }
            />
            <GameButton
              label="Contact support"
              tone="secondary"
              onPress={() => {
                void Linking.openURL('mailto:hello@promptwars.gg');
              }}
            />
          </GamePanel>
        </ScrollView>
      )}
      <View style={styles.management}>
        {signOutError && (
          <GameText accessibilityRole="alert" style={{ color: colors.error }}>
            Could not sign out. Please try again.
          </GameText>
        )}
        <GameButton
          label="Account settings"
          tone="secondary"
          onPress={() => router.push('/(profile)/settings')}
        />
        <GameButton
          label="Account deletion help"
          tone="secondary"
          onPress={() => {
            void Linking.openURL(Links.accountDeletion);
          }}
        />
        <GameButton
          label={signingOut ? 'Signing out…' : 'Sign out'}
          tone="secondary"
          disabled={signingOut}
          onPress={() => {
            if (!user?.is_anonymous) {
              void leave();
              return;
            }
            const accountId = user.id;
            confirmGuestExit({
              onSecure: () => router.push('/(profile)/settings?secure=1'),
              onContinue: () => {
                if (
                  currentUser.current?.id === accountId &&
                  currentUser.current.is_anonymous
                )
                  void leave();
              },
            });
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  panel: { alignSelf: 'center', width: '100%', maxWidth: 480, gap: 16 },
  management: {
    padding: 16,
    gap: 8,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
});
