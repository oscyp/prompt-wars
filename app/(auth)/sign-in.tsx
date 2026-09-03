import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { InlineBanner, Toast } from '@/components';
import { hapticError, hapticSelection, hapticSuccess } from '@/utils/haptics';
import {
  AuthNotices,
  PASSWORD_RESET_REDIRECT,
  PASSWORD_UPDATED_NOTICE,
  classifyAuthError,
  describeAuthError,
  validateEmail,
  validateSignInPassword,
  type AuthErrorCopy,
  type AuthErrorKind,
} from '@/utils/authCopy';

type Busy = 'idle' | 'signIn' | 'reset' | 'resend';

const TOAST_MS = 2500;

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<AuthErrorCopy | null>(null);
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const { notice } = useLocalSearchParams<{ notice?: string }>();

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

  // The reset screen ends the recovery session and lands here with this param.
  useEffect(() => {
    if (notice === PASSWORD_UPDATED_NOTICE) {
      setToast(AuthNotices.passwordUpdated);
      toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
    }
  }, [notice]);

  const isBusy = busy !== 'idle';

  const fail = (err: unknown) => {
    hapticError();
    setErrorKind(classifyAuthError(err));
    setFormError(describeAuthError(err));
  };

  const handleSignIn = async () => {
    if (isBusy) return;
    const eErr = validateEmail(email);
    const pErr = validateSignInPassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    setFormError(null);
    setErrorKind(null);
    if (eErr || pErr) {
      hapticError();
      return;
    }

    setBusy('signIn');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      hapticSuccess();
      // Navigation is handled by app/_layout.tsx once the session lands.
    } catch (err) {
      fail(err);
    } finally {
      setBusy('idle');
    }
  };

  const handleForgotPassword = async () => {
    if (isBusy) return;
    const eErr = validateEmail(email);
    if (eErr) {
      hapticError();
      setEmailError(email.trim() ? eErr : AuthNotices.forgotNeedsEmail);
      return;
    }
    setEmailError(null);
    setFormError(null);
    setBusy('reset');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: PASSWORD_RESET_REDIRECT },
      );
      if (error) throw error;
      hapticSuccess();
      showToast(AuthNotices.resetEmailSent);
    } catch (err) {
      fail(err);
    } finally {
      setBusy('idle');
    }
  };

  const handleResendConfirmation = async () => {
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
      setErrorKind(null);
      showToast(AuthNotices.confirmationResent);
    } catch (err) {
      fail(err);
    } finally {
      setBusy('idle');
    }
  };

  const inputStyle = [
    styles.input,
    accessibleText,
    { backgroundColor: colors.card, color: colors.text },
  ];

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
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          Welcome to Prompt Wars
        </Text>
        <Text
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          Sign in to battle
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
              placeholder="Password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError(null);
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
              editable={!isBusy}
              accessibilityLabel="Password"
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

          {formError ? (
            <View style={styles.banner}>
              <InlineBanner
                tone="error"
                text={formError.message}
                actionLabel={
                  errorKind === 'email_not_confirmed' ? 'Resend' : undefined
                }
                onAction={
                  errorKind === 'email_not_confirmed'
                    ? handleResendConfirmation
                    : undefined
                }
              />
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              isBusy && styles.buttonDisabled,
            ]}
            onPress={handleSignIn}
            disabled={isBusy}
            accessibilityLabel="Sign in"
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy, busy: busy === 'signIn' }}
          >
            <Text style={[styles.buttonText, accessibleText]}>
              {busy === 'signIn' ? 'Signing in…' : 'Sign in'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleForgotPassword}
            disabled={isBusy}
            accessibilityLabel="Forgot password?"
            accessibilityHint="Emails you a link to set a new password"
            accessibilityRole="button"
            accessibilityState={{ disabled: isBusy, busy: busy === 'reset' }}
            style={styles.textButton}
          >
            <Text style={[styles.link, accessibleText, { color: colors.link }]}>
              {busy === 'reset' ? 'Sending reset link…' : 'Forgot password?'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/sign-up')}
            disabled={isBusy}
            accessibilityLabel="Don’t have an account? Sign up"
            accessibilityRole="button"
            style={styles.textButton}
          >
            <Text style={[styles.link, accessibleText, { color: colors.link }]}>
              Don’t have an account? Sign up
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {toast ? <Toast text={toast} /> : null}
    </KeyboardAvoidingView>
  );
}

/**
 * Inline validation message. Marked as a live region and announced on change:
 * the Android live region alone does nothing on iOS, and a field error that is
 * only visible is invisible to a screen-reader user.
 */
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
    marginTop: Spacing.xs,
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
});
