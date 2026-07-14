import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const colors = useThemedColors();

  const handleSignUp = async () => {
    setError('');

    if (!ageConfirmed) {
      setError('You must confirm you are 18 or older to create an account.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Server-enforced: handle_new_user rejects signups without this flag.
          data: { age_confirmed: true },
        },
      });

      if (error) throw error;

      // Navigation is handled by _layout.tsx
    } catch (err: any) {
      const message: string = err.message || 'Failed to sign up';
      setError(
        message.includes('age_gate_failed')
          ? 'Account creation requires confirming you are 18 or older.'
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>
          Join Prompt Wars
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Create your account
        </Text>

        <View style={styles.form}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text },
            ]}
            placeholder="Email"
            placeholderTextColor={colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
            accessibilityLabel="Email input"
          />

          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text },
            ]}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
            accessibilityLabel="Password input"
          />

          {error ? (
            <Text style={[styles.error, { color: colors.error }]}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.ageRow}
            onPress={() => setAgeConfirmed((v) => !v)}
            disabled={loading}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ageConfirmed }}
            accessibilityLabel="Confirm you are 18 or older"
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
              {ageConfirmed ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </View>
            <Text style={[styles.ageText, { color: colors.textSecondary }]}>
              I confirm I am 18 years of age or older
            </Text>
          </TouchableOpacity>

          <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
            By signing up, you agree to our Terms of Service.
          </Text>

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              (loading || !ageConfirmed) && styles.buttonDisabled,
            ]}
            onPress={handleSignUp}
            disabled={loading || !ageConfirmed}
            accessibilityLabel="Sign up button"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating account...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            disabled={loading}
            accessibilityLabel="Go back to sign in"
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: colors.link }]}>
              Already have an account? Sign in
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
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
    height: 48,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: Typography.sizes.base,
  },
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  link: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  error: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  ageText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
});
