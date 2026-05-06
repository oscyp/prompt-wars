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

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const colors = useThemedColors();

  const handleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // Navigation is handled by _layout.tsx
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
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
          Welcome to Prompt Wars
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Sign in to battle
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
            placeholder="Password"
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
            style={[
              styles.button,
              { backgroundColor: colors.primary },
              loading && styles.buttonDisabled,
            ]}
            onPress={handleSignIn}
            disabled={loading}
            accessibilityLabel="Sign in button"
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/sign-up')}
            disabled={loading}
            accessibilityLabel="Go to sign up"
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: colors.link }]}>
              Don't have an account? Sign up
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
});
