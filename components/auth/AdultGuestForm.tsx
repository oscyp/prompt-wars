import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { GameButton, GameHeader, GamePanel, GameText } from '@/components/game';
import { GameFeedback } from '@/components/game/GameFeedback';
import { Links } from '@/constants/Links';
import { useThemedColors } from '@/hooks/useThemedColors';
import { describeAuthError } from '@/utils/authCopy';
import {
  assertAuthOperationCurrent,
  AuthSessionChangedError,
  beginAuthOperation,
  signInAnonymouslySafely,
  type AuthOperation,
} from '@/utils/authSession';
import {
  authorizeAdultGuest,
  getRegistrationConfiguration,
  type RegistrationConfiguration,
} from '@/utils/registration';
import { supabase } from '@/utils/supabase';

export function AdultGuestForm() {
  const colors = useThemedColors();
  const router = useRouter();
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const currentOperation = useRef<AuthOperation | null>(null);
  const [configuration, setConfiguration] =
    useState<RegistrationConfiguration | null>(null);
  const [configError, setConfigError] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available =
    process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED === '1' &&
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED !== '1' &&
    configuration?.enabled === false &&
    configuration.adult_guest_signup_enabled === true;

  const cancelOperation = useCallback(() => {
    if (!currentOperation.current) return;
    try {
      assertAuthOperationCurrent(currentOperation.current);
      beginAuthOperation();
    } catch {
      // A newer sign-in owns authentication now.
    }
    currentOperation.current = null;
  }, []);

  const loadConfiguration = useCallback(async () => {
    setConfigError(false);
    setConfiguration(null);
    try {
      const result = await getRegistrationConfiguration();
      if (mounted.current) setConfiguration(result);
    } catch {
      if (mounted.current) setConfigError(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadConfiguration();
    return () => {
      mounted.current = false;
      cancelOperation();
    };
  }, [loadConfiguration, cancelOperation]);

  const assertSignedOut = async (operation: AuthOperation) => {
    assertAuthOperationCurrent(operation);
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (!mounted.current || sessionError || data.session)
      throw new AuthSessionChangedError();
    assertAuthOperationCurrent(operation);
  };

  const play = async () => {
    if (
      !mounted.current ||
      busyRef.current ||
      !available ||
      !ageConfirmed ||
      !acceptedTerms
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const operation = beginAuthOperation();
    currentOperation.current = operation;
    try {
      await assertSignedOut(operation);
      // Keep the single-use permit only in this request's memory.
      const permit = await authorizeAdultGuest({
        age_confirmed: true,
        terms_accepted: true,
      });
      await assertSignedOut(operation);
      if (
        permit?.authorized !== true ||
        typeof permit.authorization_token !== 'string' ||
        !permit.authorization_token.trim() ||
        typeof permit.permit_expires_at !== 'string' ||
        !Number.isFinite(Date.parse(permit.permit_expires_at)) ||
        Date.parse(permit.permit_expires_at) <= Date.now()
      )
        throw { code: 'invalid_adult_guest_permit' };
      const { data, error: signupError } = await signInAnonymouslySafely(
        {
          options: {
            data: { adult_guest_authorization: permit.authorization_token },
          },
        },
        operation,
      );
      if (signupError) throw signupError;
      if (!data.session)
        throw new Error('Guest play could not start. Please try again.');
      // The root auth gate routes the published session into onboarding.
    } catch (failure) {
      if (mounted.current) {
        const code = (failure as { code?: string } | null)?.code;
        setError(
          code === 'invalid_adult_guest_permit'
            ? 'Guest play could not be authorized. Please try again.'
            : describeAuthError(failure).message,
        );
      }
    } finally {
      currentOperation.current = null;
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <GamePanel style={styles.panel}>
        <GameHeader title="Play as a guest" />
        {!configuration ? (
          <GameFeedback
            icon="shield-check"
            title={
              configError
                ? 'Could not check guest play'
                : 'Checking guest play…'
            }
            busy={!configError}
            message={
              configError ? 'Check your connection and try again.' : undefined
            }
            action={
              configError
                ? { label: 'Retry', onPress: () => void loadConfiguration() }
                : undefined
            }
          />
        ) : !available ? (
          <GameFeedback
            icon="shield-check"
            title="Guest play is not available yet"
            message="You can still sign in or create an account."
          />
        ) : (
          <>
            <GameText>Prompt Wars is for players aged 18 and over.</GameText>
            <GameText>
              Your progress is saved on our servers. If this device loses its
              session, you may lose access. Link an email in Settings to recover
              this account on another device.
            </GameText>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityLabel="I confirm I am 18 years of age or older"
              accessibilityState={{ checked: ageConfirmed, disabled: busy }}
              disabled={busy}
              onPress={() => setAgeConfirmed((value) => !value)}
              style={styles.confirmation}
            >
              <GameText>
                {ageConfirmed ? '☑' : '☐'} I confirm I am 18 years of age or
                older
              </GameText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="checkbox"
              accessibilityLabel="I agree to the Terms and acknowledge the Privacy Policy"
              accessibilityState={{ checked: acceptedTerms, disabled: busy }}
              disabled={busy}
              onPress={() => setAcceptedTerms((value) => !value)}
              style={styles.confirmation}
            >
              <GameText>
                {acceptedTerms ? '☑' : '☐'} I agree to the Terms and acknowledge
                the Privacy Policy
              </GameText>
            </TouchableOpacity>
            <GameText>
              <GameText
                accessibilityRole="link"
                accessibilityLabel="Terms and conditions"
                style={{ color: colors.link }}
                onPress={() => void Linking.openURL(Links.termsAndConditions)}
              >
                Terms &amp; Conditions
              </GameText>
              {' · '}
              <GameText
                accessibilityRole="link"
                accessibilityLabel="Privacy policy"
                style={{ color: colors.link }}
                onPress={() => void Linking.openURL(Links.privacyPolicy)}
              >
                Privacy Policy
              </GameText>
            </GameText>
            {error ? (
              <GameText
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={{ color: colors.error }}
              >
                {error}
              </GameText>
            ) : null}
            <GameButton
              label="Play now"
              busy={busy}
              disabled={!ageConfirmed || !acceptedTerms}
              onPress={() => void play()}
            />
          </>
        )}
        <GameButton
          label="Back"
          tone="secondary"
          onPress={() => {
            cancelOperation();
            router.replace('/(auth)/entry');
          }}
        />
      </GamePanel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16 },
  confirmation: { minHeight: 48, justifyContent: 'center' },
});
