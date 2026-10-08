import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  GameButton,
  GameField,
  GameHeader,
  GamePanel,
  GameText,
} from '@/components/game';
import { GameFeedback } from '@/components/game/GameFeedback';
import BrandMark from '@/components/game/BrandMark';
import { SocialAuthButtons } from './SocialAuthButtons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useNativeHeaderOffset } from '@/hooks/useNativeHeaderOffset';
import { Links } from '@/constants/Links';
import { supabase } from '@/utils/supabase';
import {
  beginAuthOperation,
  assertAuthOperationCurrent,
  signUpWithPasswordSafely,
  signInAnonymouslySafely,
  type AuthOperation,
} from '@/utils/authSession';
import {
  acquireSocialCredential,
  signInWithSocialCredential,
  type SocialProvider,
} from '@/utils/socialAuth';
import {
  describeAuthError,
  signUpOutcome,
  validateEmail,
  validateNewPassword,
} from '@/utils/authCopy';
import {
  authorizeRegistration,
  checkRegistration,
  completeExistingEligibility,
  getRegistrationConfiguration,
  startRegistration,
  type RegistrationConfiguration,
  type RegistrationState,
} from '@/utils/registration';

const COUNTRY_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );

function errorCode(error: unknown): string {
  const value = error as { code?: unknown; body?: { code?: unknown } } | null;
  const code = value?.body?.code ?? value?.code;
  return typeof code === 'string' ? code : '';
}

function messageFor(error: unknown) {
  const messages: Record<string, string> = {
    underage: 'You cannot create an account with the age information provided.',
    region_unavailable:
      'Registration is not available for this country or region. Check that your country and any required state or province are correct.',
    assurance_required:
      'Registration needs an additional age check that is not available yet.',
    registration_unavailable:
      'Registration is not available yet. Please try again later.',
    registration_rate_limited:
      'Too many registration attempts. Please try again later.',
    invalid_birth_date: 'Enter a valid date of birth in YYYY-MM-DD format.',
    invalid_region: 'Choose your country and check the state or province code.',
    registration_required:
      'This registration is no longer available. Start again to continue.',
    registration_expired: 'This registration expired. Start again to continue.',
    registration_already_bound:
      'This registration is already linked to a sign-in method. Use that method or start a new registration.',
    session_changed:
      'Your signed-in account changed. Reopen registration to continue.',
    consent_unavailable:
      'Guardian consent is not available yet. Your registration stays pending.',
  };
  return messages[errorCode(error)] ?? describeAuthError(error).message;
}

function needsUpdate(minimum: string) {
  const version = Constants.expoConfig?.version;
  if (!version || !/^\d+\.\d+\.\d+$/.test(minimum)) return true;
  const current = version.split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (!Number.isFinite(current[index])) return true;
    if (current[index] !== required[index])
      return current[index] < required[index];
  }
  return false;
}

export function RegistrationForm({
  existingAccountId,
  onComplete,
  guest = false,
}: {
  existingAccountId?: string;
  guest?: boolean;
  onComplete?: () => Promise<void>;
}) {
  const colors = useThemedColors();
  const headerOffset = useNativeHeaderOffset();
  const router = useRouter();
  const mounted = useRef(true);
  const currentOperation = useRef<AuthOperation | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [configuration, setConfiguration] =
    useState<RegistrationConfiguration | null>(null);
  const [configError, setConfigError] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [countryQuery, setCountryQuery] = useState('');
  const [country, setCountry] = useState('');
  const [subdivision, setSubdivision] = useState('');
  // Do not put this token or DOB in storage, route params, logs, or analytics.
  const [registration, setRegistration] = useState<RegistrationState | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [underage, setUnderage] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [outcome, setOutcome] = useState<
    'confirm_email' | 'existing_account' | null
  >(null);

  const countries = useMemo(() => {
    let names: Intl.DisplayNames | undefined;
    try {
      names = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      /* Codes remain usable on older runtimes. */
    }
    return COUNTRY_CODES.map((code) => ({
      code,
      name: names?.of(code) ?? code,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const loadConfiguration = useCallback(async () => {
    setConfigError(false);
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
      if (currentOperation.current) {
        try {
          assertAuthOperationCurrent(currentOperation.current);
          beginAuthOperation();
        } catch {
          /* Preserve newer authentication intent. */
        }
      }
    };
  }, [loadConfiguration]);

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current || !mounted.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      if (!mounted.current) return;
      setError(messageFor(failure));
      if (errorCode(failure) === 'underage') {
        setBirthDate('');
        setUnderage(true);
      }
      if (errorCode(failure) === 'registration_expired') {
        setRegistration((current) =>
          current
            ? { ...current, status: 'expired', hosted_url: undefined }
            : null,
        );
        setPassword('');
        setAcceptedTerms(false);
      }
    } finally {
      currentOperation.current = null;
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const matchesAccount = async () => {
    if (!mounted.current) return false;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (!mounted.current) return false;
    if (
      sessionError ||
      (data.session?.user.id ?? null) !== (existingAccountId ?? null)
    )
      throw { code: 'session_changed' };
    return true;
  };

  const refreshStatus = () =>
    run(async () => {
      if (!registration || !(await matchesAccount())) return;
      const next = await checkRegistration(registration.registration_token);
      if (await matchesAccount()) setRegistration(next);
    });
  const refreshRef = useRef(refreshStatus);
  refreshRef.current = refreshStatus;
  const pendingStatus = registration?.status;
  useEffect(() => {
    if (
      !pendingStatus ||
      !['pending', 'consent_required', 'consent_unavailable'].includes(
        pendingStatus,
      )
    )
      return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshRef.current();
    });
    return () => subscription.remove();
  }, [pendingStatus]);

  const start = () =>
    run(async () => {
      if (
        configuration?.enabled !== true ||
        (guest && configuration.guest_signup_enabled !== true) ||
        needsUpdate(configuration.minimum_client_version)
      )
        return;
      const parsed = new Date(`${birthDate}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== birthDate
      )
        throw { code: 'invalid_birth_date' };
      if (!country) throw { code: 'invalid_region' };
      if (!(await matchesAccount())) return;
      const region = subdivision.trim().toUpperCase();
      const next = await startRegistration({
        birth_date: birthDate,
        country,
        subdivision: region
          ? region.startsWith(`${country}-`)
            ? region
            : `${country}-${region}`
          : '',
      });
      if (!(await matchesAccount())) return;
      setBirthDate('');
      setRegistration(next);
    });

  const canCreate =
    registration?.status === 'eligible' || registration?.status === 'approved';
  const guestSignUp = () =>
    run(async () => {
      if (
        !guest ||
        existingAccountId ||
        !canCreate ||
        !registration ||
        !acceptedTerms ||
        configuration?.enabled !== true ||
        configuration.guest_signup_enabled !== true
      )
        return;
      const operation = beginAuthOperation();
      currentOperation.current = operation;
      if (!(await matchesAccount())) return;
      assertAuthOperationCurrent(operation);
      const permit = await authorizeRegistration(
        registration.registration_token,
        { provider: 'anonymous' },
      );
      if (!(await matchesAccount())) return;
      assertAuthOperationCurrent(operation);
      if (
        !permit.authorization_token ||
        !Number.isFinite(Date.parse(permit.permit_expires_at)) ||
        Date.parse(permit.permit_expires_at) <= Date.now()
      )
        throw { code: 'registration_expired' };
      const { data, error: signupError } = await signInAnonymouslySafely(
        {
          options: {
            data: { registration_authorization: permit.authorization_token },
          },
        },
        operation,
      );
      if (signupError) throw signupError;
      if (!data.session)
        throw new Error('Guest play could not start. Please try again.');
    });

  const emailSignUp = () =>
    run(async () => {
      if (!canCreate || !registration || !acceptedTerms) return;
      const invalid = validateEmail(email) ?? validateNewPassword(password);
      if (invalid) {
        setError(invalid);
        return;
      }
      const operation = beginAuthOperation();
      currentOperation.current = operation;
      if (!(await matchesAccount())) return;
      assertAuthOperationCurrent(operation);
      const permit = await authorizeRegistration(
        registration.registration_token,
        { email: email.trim() },
      );
      if (!(await matchesAccount())) return;
      const { data, error: signupError } = await signUpWithPasswordSafely(
        {
          email: email.trim(),
          password,
          options: {
            data: { registration_authorization: permit.authorization_id },
          },
        },
        operation,
      );
      if (!mounted.current) return;
      if (signupError) throw signupError;
      setPassword('');
      const result = signUpOutcome(data);
      if (result !== 'signed_in') setOutcome(result);
    });

  const socialSignUp = (provider: SocialProvider) =>
    run(async () => {
      const operation = beginAuthOperation();
      currentOperation.current = operation;
      if (
        !canCreate ||
        !registration ||
        !acceptedTerms ||
        !(await matchesAccount())
      )
        return;
      assertAuthOperationCurrent(operation);
      const credential = await acquireSocialCredential(provider, operation);
      if (!credential || !mounted.current) return;
      if (!(await matchesAccount())) return;
      await authorizeRegistration(registration.registration_token, credential);
      if (!(await matchesAccount())) return;
      await signInWithSocialCredential(credential);
    });

  const complete = () =>
    run(async () => {
      if (
        !existingAccountId ||
        !canCreate ||
        !registration ||
        !acceptedTerms ||
        !(await matchesAccount())
      )
        return;
      await completeExistingEligibility(
        registration.registration_token,
        existingAccountId,
      );
      if (await matchesAccount()) await onComplete?.();
    });

  const openGuardian = () =>
    run(async () => {
      if (!configuration?.guardian_consent_ready || !registration?.hosted_url)
        return;
      const url = new URL(registration.hosted_url);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('invalid_consent_url');
      await Linking.openURL(url.toString());
      // Opening/returning from the provider never changes approval locally.
    });
  const availableCountries =
    !country && countryQuery.trim()
      ? countries
          .filter(
            (item) =>
              item.name
                .toLowerCase()
                .includes(countryQuery.trim().toLowerCase()) ||
              item.code.toLowerCase() === countryQuery.trim().toLowerCase(),
          )
          .slice(0, 8)
      : [];
  const pendingTitle =
    registration?.status === 'consent_unavailable'
      ? 'Guardian consent is not available yet'
      : registration?.status === 'expired'
        ? 'Registration expired'
        : registration?.status === 'denied' ||
            registration?.status === 'revoked'
          ? 'Registration is restricted'
          : 'Waiting for guardian consent';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerOffset}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <BrandMark size={168} style={{ alignSelf: 'center' }} />
        <GamePanel style={styles.panel}>
          {!configuration ? (
            <GameFeedback
              icon="shield-check"
              title={
                configError
                  ? 'Could not check registration'
                  : 'Checking registration…'
              }
              message={
                configError ? 'Check your connection and try again.' : undefined
              }
              busy={!configError}
              action={
                configError
                  ? { label: 'Retry', onPress: () => void loadConfiguration() }
                  : undefined
              }
            />
          ) : !configuration.enabled ? (
            <GameFeedback
              icon="shield-check"
              title="Registration is not available yet"
              message="Existing players can still sign in. Please try again later."
            />
          ) : guest && configuration.guest_signup_enabled !== true ? (
            <GameFeedback
              icon="shield-check"
              title="Guest play is not available yet"
              message="You can still sign in or create an account with a sign-in method."
            />
          ) : needsUpdate(configuration.minimum_client_version) ? (
            <GameFeedback
              icon="shield-check"
              title="Update Prompt Wars to continue"
              message="Install the latest version to create or update your account."
            />
          ) : underage ? (
            <GameFeedback
              icon="shield-check"
              title="You cannot create an account"
              message="Your account does not meet the eligibility requirements. Contact support if you need help with this decision."
            />
          ) : outcome ? (
            <>
              <GameHeader
                title={
                  outcome === 'confirm_email'
                    ? 'Check your inbox'
                    : 'Account already exists'
                }
              />
              <GameText>
                {outcome === 'confirm_email'
                  ? `Open the confirmation email sent to ${email.trim()}, then come back and sign in.`
                  : 'Sign in with your existing account to continue.'}
              </GameText>
              {outcome === 'confirm_email' && (
                <GameButton
                  tone="secondary"
                  label="Resend confirmation email"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const result = await supabase.auth.resend({
                        type: 'signup',
                        email: email.trim(),
                      });
                      if (result.error) throw result.error;
                    })
                  }
                />
              )}
            </>
          ) : !registration ? (
            <>
              <GameHeader
                title={
                  existingAccountId
                    ? 'Check your account'
                    : 'Create your account'
                }
              />
              <GameText>
                We use your date of birth and country to check which account
                options are available.
              </GameText>
              <GameField
                label="Date of birth"
                accessibilityLabel="Date of birth"
                placeholder="YYYY-MM-DD"
                value={birthDate}
                onChangeText={setBirthDate}
                autoComplete="off"
                autoCorrect={false}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                disabled={busy}
              />
              <GameField
                label="Country or region"
                accessibilityLabel="Country or region"
                placeholder="Search your country or region"
                value={countryQuery}
                onChangeText={(value) => {
                  setCountryQuery(value);
                  setCountry('');
                  setSubdivision('');
                }}
                autoCorrect={false}
                disabled={busy}
              />
              {availableCountries.map((item) => (
                <GameButton
                  key={item.code}
                  tone="secondary"
                  label={item.name}
                  accessibilityLabel={item.name}
                  disabled={busy}
                  onPress={() => {
                    setCountry(item.code);
                    setCountryQuery(item.name);
                  }}
                />
              ))}
              <GameField
                label="State or province code (if required)"
                accessibilityHint="Use the short regional code, for example CA for California."
                placeholder="For example, CA"
                value={subdivision}
                onChangeText={setSubdivision}
                autoCapitalize="characters"
                maxLength={6}
                disabled={busy}
              />
              <GameButton
                label={busy ? 'Checking…' : 'Continue'}
                accessibilityLabel="Continue"
                disabled={busy}
                onPress={() => void start()}
              />
            </>
          ) : !canCreate ? (
            <>
              <GameFeedback
                icon="shield-check"
                title={pendingTitle}
                message={
                  registration.status === 'consent_unavailable'
                    ? 'Your registration stays pending. You can check again later; an account cannot be created until required consent is verified.'
                    : registration.status === 'expired'
                      ? 'This registration is no longer valid. Start again when you are ready.'
                      : registration.status === 'denied' ||
                          registration.status === 'revoked'
                        ? 'Required consent was declined or withdrawn. Contact support for help.'
                        : 'Your parent or guardian needs to finish the consent process before you can continue.'
                }
              />
              {configuration.guardian_consent_ready &&
                registration.hosted_url &&
                ['pending', 'consent_required'].includes(
                  registration.status,
                ) && (
                  <GameButton
                    label="Open guardian consent"
                    disabled={busy}
                    onPress={() => void openGuardian()}
                  />
                )}
              {['pending', 'consent_required', 'consent_unavailable'].includes(
                registration.status,
              ) && (
                <GameButton
                  label="Check status"
                  tone="secondary"
                  disabled={busy}
                  onPress={() => void refreshStatus()}
                />
              )}
              {registration.status === 'expired' && (
                <GameButton
                  label="Start again"
                  disabled={busy}
                  onPress={() => {
                    setRegistration(null);
                    setPassword('');
                    setAcceptedTerms(false);
                    setError(null);
                  }}
                />
              )}
            </>
          ) : (
            <>
              <GameHeader
                title={
                  existingAccountId
                    ? 'Ready to continue'
                    : guest
                      ? 'Ready to play'
                      : 'Choose how to sign up'
                }
              />
              <TouchableOpacity
                accessibilityRole="checkbox"
                accessibilityLabel="I agree to the Terms and acknowledge the Privacy Policy"
                accessibilityState={{ checked: acceptedTerms, disabled: busy }}
                disabled={busy}
                onPress={() => setAcceptedTerms((value) => !value)}
                style={styles.terms}
              >
                <GameText>
                  {acceptedTerms ? '☑' : '☐'} I agree to the Terms and
                  acknowledge the Privacy Policy.
                </GameText>
              </TouchableOpacity>
              {existingAccountId ? (
                <GameButton
                  label="Continue to Prompt Wars"
                  disabled={busy || !acceptedTerms}
                  onPress={() => void complete()}
                />
              ) : guest ? (
                <>
                  <GameText>
                    Play as a guest on this device. You can secure your progress
                    in Settings later.
                  </GameText>
                  <GameButton
                    label={busy ? 'Starting…' : 'Play now'}
                    accessibilityLabel="Play now"
                    disabled={busy || !acceptedTerms}
                    onPress={() => void guestSignUp()}
                  />
                </>
              ) : (
                <>
                  <SocialAuthButtons
                    mode="sign-up"
                    onPress={socialSignUp}
                    disabled={busy || !acceptedTerms}
                  />
                  <GameField
                    label="Email"
                    accessibilityLabel="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    disabled={busy}
                  />
                  <GameField
                    label="Password"
                    accessibilityLabel="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    disabled={busy}
                  />
                  <GameButton
                    label="Create account"
                    disabled={busy || !acceptedTerms}
                    onPress={() => void emailSignUp()}
                  />
                </>
              )}
            </>
          )}
          {error && (
            <GameText
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{ color: colors.error }}
            >
              {error}
            </GameText>
          )}
          <GameButton
            label="Terms & Conditions"
            tone="secondary"
            onPress={() => {
              void Linking.openURL(Links.termsAndConditions);
            }}
          />
          <GameButton
            label="Privacy Policy"
            tone="secondary"
            onPress={() => {
              void Linking.openURL(Links.privacyPolicy);
            }}
          />
          <GameButton
            label="Contact support"
            tone="secondary"
            onPress={() => {
              void Linking.openURL('mailto:hello@promptwars.gg');
            }}
          />
          {!existingAccountId && (
            <GameButton
              label="Back to sign in"
              tone="secondary"
              disabled={busy}
              onPress={() => router.replace('/(auth)/sign-in')}
            />
          )}
        </GamePanel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  panel: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    padding: 20,
    gap: 16,
  },
  terms: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 },
});
