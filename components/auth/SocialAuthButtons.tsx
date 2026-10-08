/* eslint-disable @typescript-eslint/no-require-imports -- Native Google UI loads only after platform, rollout, and SDK availability checks. */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GameText } from '@/components/game/GameText';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  getAvailableSocialProviders,
  isSocialAuthCancelled,
  SocialAuthError,
  type SocialProvider,
} from '@/utils/socialAuth';
export interface SocialAuthButtonsProps {
  onPress: (provider: SocialProvider) => void | Promise<void>;
  disabled?: boolean;
  busyProvider?: SocialProvider | null;
  mode?: 'sign-in' | 'sign-up' | 'connect';
  providers?: SocialProvider[];
  providerLabels?: Partial<Record<SocialProvider, string>>;
}

function loadGoogleButton() {
  return (
    require('react-native-nitro-google-signin') as typeof import('react-native-nitro-google-signin')
  ).GoogleSignInButton;
}

/** Provider-owned native controls preserve Apple's and Google's branding. */
export function SocialAuthButtons({
  onPress,
  disabled = false,
  busyProvider,
  mode = 'sign-in',
  providers,
  providerLabels,
}: SocialAuthButtonsProps) {
  const colors = useThemedColors();
  const [available, setAvailable] = useState<SocialProvider[]>([]);
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const pendingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    getAvailableSocialProviders()
      .then((value) => {
        if (mounted.current) setAvailable(value);
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  const visible = available.filter(
    (provider) => !providers || providers.includes(provider),
  );
  if (!visible.length) return null;
  const activeProvider = pending ?? busyProvider;
  const blocked = disabled || Boolean(activeProvider);
  const label = (provider: SocialProvider) =>
    providerLabels?.[provider] ??
    `${mode === 'connect' ? 'Connect' : mode === 'sign-up' ? 'Sign up with' : 'Sign in with'} ${provider === 'apple' ? 'Apple' : 'Google'}`;
  const press = async (provider: SocialProvider) => {
    if (blocked || pendingRef.current) return;
    pendingRef.current = true;
    setPending(provider);
    setError(null);
    try {
      await onPress(provider);
    } catch (err) {
      if (mounted.current && !isSocialAuthCancelled(err)) {
        setError(
          err instanceof SocialAuthError
            ? err.message
            : 'Could not sign in. Please try again.',
        );
      }
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(null);
    }
  };
  // Requiring the native module only when available lets web and older native
  // binaries keep their password path while social sign-in is rolled out.
  const GoogleButton = visible.includes('google') ? loadGoogleButton() : null;

  return (
    <View style={styles.container}>
      {visible.includes('apple') && (
        <View
          pointerEvents={blocked ? 'none' : 'auto'}
          style={blocked ? styles.disabled : undefined}
        >
          {providerLabels?.apple && (
            <GameText variant="caption">{providerLabels.apple}</GameText>
          )}
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              mode === 'sign-up'
                ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                : mode === 'connect'
                  ? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            }
            cornerRadius={6}
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel={label('apple')}
            accessibilityState={{
              disabled: blocked,
              busy: activeProvider === 'apple',
            }}
            onPress={() => {
              void press('apple');
            }}
          />
        </View>
      )}
      {GoogleButton && (
        <GoogleButton
          size="wide"
          colorScheme="light"
          signInBehavior="none"
          style={styles.button}
          disabled={blocked}
          loading={activeProvider === 'google'}
          accessibilityRole="button"
          accessibilityLabel={label('google')}
          accessibilityState={{
            disabled: blocked,
            busy: activeProvider === 'google',
          }}
          onPress={() => press('google')}
        />
      )}
      {activeProvider && (
        <ActivityIndicator
          accessibilityLabel="Connecting sign-in method"
          color={colors.primary}
        />
      )}
      {error && (
        <GameText accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </GameText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, alignSelf: 'stretch', marginBottom: 12 },
  button: { width: '100%', height: 48 },
  disabled: { opacity: 0.6 },
});
