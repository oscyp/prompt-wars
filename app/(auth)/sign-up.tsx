import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Ink,
  Layout,
} from '@/constants/DesignTokens';
import { Links } from '@/constants/Links';
import { InlineBanner, Toast } from '@/components';
import { hapticError, hapticSelection, hapticSuccess } from '@/utils/haptics';
import {
  AuthNotices,
  MIN_PASSWORD_LENGTH,
  describeAuthError,
  signUpOutcome,
  validateEmail,
  validateNewPassword,
  type AuthErrorCopy,
} from '@/utils/authCopy';

type Phase = 'form' | 'confirm_email' | 'existing_account';
type Busy = 'idle' | 'signUp' | 'resend';

const TOAST_MS = 2500;

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<AuthErrorCopy | null>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [busy, setBusy] = useState<Busy>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const isBusy = busy !== 'idle';

  const fail = (err: unknown) => {
    hapticError();
    setFormError(describeAuthError(err));
  };

  const handleSignUp = async () => {
    if (isBusy || !ageConfirmed) return;
    const eErr = validateEmail(email);
    const pErr = validateNewPassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(null);
    if (eErr || pErr) {
      hapticError();
      return;
    }

    setBusy('signUp');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Server-enforced: handle_new_user rejects signups without this flag.
          data: { age_confirmed: true },
        },
      });
      if (error) throw error;

      switch (signUpOutcome(data)) {
        case 'existing_account':
          hapticError();
          setPhase('existing_account');
          break;
        case 'confirm_email':
          hapticSuccess();
          setPhase('confirm_email');
          break;
        case 'signed_in':
          hapticSuccess();
          // Navigation is handled by app/_layout.tsx once the session lands.
          break;
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy('idle');
    }
  };

  const handleResend = async () => {
    if (isBusy) return;
    setBusy('resend');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (error) throw error;
      hapticSuccess();
      setFormError(null);
      showToast(AuthNotices.confirmationResent);
    } catch (err) {
      fail(err);
    } finally {
      setBusy('idle');
    }
  };

  const goToSignIn = () => router.replace('/(auth)/sign-in');

  const inputStyle = [
    styles.input,
    accessibleText,
    { backgroundColor: colors.card, color: colors.text },
  ];

  const canSubmit = ageConfirmed && !isBusy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {phase === 'confirm_email' ? (
          <View style={styles.form}>
            <Text
              accessibilityRole="header"
              style={[styles.title, accessibleText, { color: colors.text }]}
            >
              Check your inbox
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.body,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              We sent a confirmation link to {email.trim()}. Open it, then come
              back and sign in.
            </Text>
            {formError ? (
              <View style={styles.banner}>
                <InlineBanner tone="error" text={formError.message} />
              </View>
            ) : null}
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: colors.primary },
                isBusy && styles.buttonDisabled,
              ]}
              onPress={goToSignIn}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              accessibilityState={{ disabled: isBusy }}
            >
              <Text style={[styles.buttonText, accessibleText]}>
                Back to sign in
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleResend}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Resend confirmation email"
              accessibilityState={{ disabled: isBusy, busy: busy === 'resend' }}
              style={styles.textButton}
            >
              <Text
                style={[styles.link, accessibleText, { color: colors.link }]}
              >
                {busy === 'resend' ? 'Sending…' : 'Resend email'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : phase === 'existing_account' ? (
          <View style={styles.form}>
            <Text
              accessibilityRole="header"
              style={[styles.title, accessibleText, { color: colors.text }]}
            >
              That email already has an account
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                styles.body,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              That email already has an account. Sign in instead.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }]}
              onPress={goToSignIn}
              accessibilityRole="button"
              accessibilityLabel="Go to sign in"
            >
              <Text style={[styles.buttonText, accessibleText]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setPhase('form');
                setEmail('');
                setPassword('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Use a different email"
              style={styles.textButton}
            >
              <Text
                style={[styles.link, accessibleText, { color: colors.link }]}
              >
                Use a different email
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text
              accessibilityRole="header"
              style={[styles.title, accessibleText, { color: colors.text }]}
            >
              Join Prompt Wars
            </Text>
            <Text
              style={[
                styles.subtitle,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              Create your account
            </Text>

            <View style={styles.form}>
              <TextInput
                style={[
                  inputStyle,
                  emailError ? { borderColor: colors.error } : null,
                ]}
                placeholder="Email"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isBusy}
                accessibilityLabel="Email"
              />
              <FieldError text={emailError} />

              <View style={styles.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[
                    inputStyle,
                    styles.passwordInput,
                    passwordError ? { borderColor: colors.error } : null,
                  ]}
                  placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    if (passwordError) setPasswordError(null);
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  passwordRules={`minlength: ${MIN_PASSWORD_LENGTH};`}
                  returnKeyType="go"
                  onSubmitEditing={handleSignUp}
                  editable={!isBusy}
                  accessibilityLabel="Password"
                  accessibilityHint={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
                <TouchableOpacity
                  onPress={() => {
                    hapticSelection();
                    setShowPassword((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  style={styles.reveal}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              <FieldError text={passwordError} />

              <TouchableOpacity
                style={styles.ageRow}
                onPress={() => {
                  hapticSelection();
                  setAgeConfirmed((v) => !v);
                }}
                disabled={isBusy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ageConfirmed, disabled: isBusy }}
                accessibilityLabel="I confirm I am 18 years of age or older"
                accessibilityHint="Required to create an account"
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: colors.textTertiary },
                    ageConfirmed && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  {ageConfirmed ? (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={Ink.onAccentLight}
                    />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.ageText,
                    accessibleText,
                    { color: colors.text },
                  ]}
                >
                  I confirm I am 18 years of age or older
                </Text>
              </TouchableOpacity>

              {/* App Store 3.1.2: these must be functional links, not prose. */}
              <Text
                style={[
                  styles.disclaimer,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                By signing up, you agree to our{' '}
                <Text
                  style={[styles.disclaimerLink, { color: colors.link }]}
                  onPress={() => Linking.openURL(Links.termsAndConditions)}
                  accessibilityRole="link"
                  accessibilityLabel="Terms and conditions"
                >
                  Terms &amp; Conditions
                </Text>{' '}
                and{' '}
                <Text
                  style={[styles.disclaimerLink, { color: colors.link }]}
                  onPress={() => Linking.openURL(Links.privacyPolicy)}
                  accessibilityRole="link"
                  accessibilityLabel="Privacy policy"
                >
                  Privacy Policy
                </Text>
                .
              </Text>

              {formError ? (
                <View style={styles.banner}>
                  <InlineBanner tone="error" text={formError.message} />
                </View>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: colors.primary },
                  !canSubmit && styles.buttonDisabled,
                ]}
                onPress={handleSignUp}
                disabled={!canSubmit}
                accessibilityLabel="Sign up"
                accessibilityHint={
                  ageConfirmed
                    ? undefined
                    : 'Confirm you are 18 or older to continue'
                }
                accessibilityRole="button"
                accessibilityState={{
                  disabled: !canSubmit,
                  busy: busy === 'signUp',
                }}
              >
                <Text style={[styles.buttonText, accessibleText]}>
                  {busy === 'signUp' ? 'Creating account…' : 'Sign up'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={goToSignIn}
                disabled={isBusy}
                accessibilityLabel="Already have an account? Sign in"
                accessibilityRole="button"
                style={styles.textButton}
              >
                <Text
                  style={[styles.link, accessibleText, { color: colors.link }]}
                >
                  Already have an account? Sign in
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
      {toast ? <Toast text={toast} /> : null}
    </KeyboardAvoidingView>
  );
}

/** Inline validation message; live region plus an explicit announcement. */
function FieldError({ text }: { text: string | null }) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
  if (!text) return null;
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.fieldError, accessibleText, { color: colors.error }]}
    >
      {text}
    </Text>
  );
}

const CHECKBOX = 24;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.lg,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  body: {
    fontSize: Typography.sizes.base,
    lineHeight: 24,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  input: {
    minHeight: Layout.buttonHeight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    fontSize: Typography.sizes.base,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  passwordInput: {
    flex: 1,
    paddingRight: Layout.inputHeight + Spacing.xs,
  },
  reveal: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: Layout.inputHeight,
    height: Layout.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.sm,
  },
  banner: {
    marginTop: Spacing.sm,
  },
  button: {
    minHeight: Layout.buttonHeight,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  textButton: {
    minHeight: Layout.inputHeight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  link: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  disclaimerLink: {
    textDecorationLine: 'underline',
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Layout.inputHeight,
    marginTop: Spacing.sm,
  },
  checkbox: {
    width: CHECKBOX,
    height: CHECKBOX,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ageText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
});
