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
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Ink,
  Layout,
} from '@/constants/DesignTokens';
import { InlineBanner } from '@/components';
import { hapticError, hapticSelection, hapticSuccess } from '@/utils/haptics';
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_UPDATED_NOTICE,
  describeAuthError,
  validateNewPassword,
  validatePasswordConfirmation,
  type AuthErrorCopy,
} from '@/utils/authCopy';

/**
 * Sets a new password from a recovery link.
 *
 * Reached via `promptwars://reset-password#access_token=…` (see
 * `parseRecoveryLink`). AuthProvider turns the link into a session and flags
 * `recoveryPending`; the root gate keeps the player here until the password is
 * saved. Saving ends the recovery session and returns to sign-in, so the new
 * password is proven immediately rather than assumed.
 */
export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState<AuthErrorCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmationRef = useRef<TextInput>(null);
  const router = useRouter();
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const { session, recoveryProcessing, completeRecovery } = useAuth();

  const handleSave = async () => {
    if (busy) return;
    const pErr = validateNewPassword(password);
    const cErr = pErr
      ? null
      : validatePasswordConfirmation(password, confirmation);
    setPasswordError(pErr);
    setConfirmationError(cErr);
    setFormError(null);
    if (pErr || cErr) {
      hapticError();
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      hapticSuccess();
      await completeRecovery();
      router.replace({
        pathname: '/(auth)/sign-in',
        params: { notice: PASSWORD_UPDATED_NOTICE },
      });
    } catch (err) {
      hapticError();
      setFormError(describeAuthError(err));
      setBusy(false);
    }
  };

  const inputStyle = [
    styles.input,
    accessibleText,
    { backgroundColor: colors.card, color: colors.text },
  ];

  let body: React.ReactNode;
  if (session) {
    body = (
      <View style={styles.form}>
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          Set a new password
        </Text>
        <Text
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          At least {MIN_PASSWORD_LENGTH} characters.
        </Text>

        <View style={styles.passwordRow}>
          <TextInput
            style={[
              inputStyle,
              styles.passwordInput,
              passwordError ? { borderColor: colors.error } : null,
            ]}
            placeholder="New password"
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
            returnKeyType="next"
            onSubmitEditing={() => confirmationRef.current?.focus()}
            editable={!busy}
            accessibilityLabel="New password"
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

        <TextInput
          ref={confirmationRef}
          style={[
            inputStyle,
            confirmationError ? { borderColor: colors.error } : null,
          ]}
          placeholder="Confirm new password"
          placeholderTextColor={colors.textTertiary}
          value={confirmation}
          onChangeText={(v) => {
            setConfirmation(v);
            if (confirmationError) setConfirmationError(null);
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSave}
          editable={!busy}
          accessibilityLabel="Confirm new password"
        />
        <FieldError text={confirmationError} />

        {formError ? (
          <View style={styles.banner}>
            <InlineBanner tone="error" text={formError.message} />
          </View>
        ) : null}

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: colors.primary },
            busy && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Save new password"
          accessibilityState={{ disabled: busy, busy }}
        >
          {busy ? (
            <ActivityIndicator color={Ink.onAccentLight} />
          ) : (
            <Text style={[styles.buttonText, accessibleText]}>
              Save new password
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  } else if (recoveryProcessing) {
    body = (
      <View style={styles.holding}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          Opening your reset link…
        </Text>
      </View>
    );
  } else {
    body = (
      <View style={styles.form}>
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          Reset link expired
        </Text>
        <Text
          style={[
            styles.subtitle,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          This reset link has expired or was already used. Request a new one
          from the sign-in screen.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/(auth)/sign-in')}
          accessibilityRole="button"
          accessibilityLabel="Request a new link"
        >
          <Text style={[styles.buttonText, accessibleText]}>
            Request a new link
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        {body}
      </ScrollView>
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
  holding: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    lineHeight: 24,
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
});
