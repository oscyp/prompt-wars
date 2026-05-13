import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import {
  GlassInput,
  GlowGradientButton,
  HapticPressable,
  NeonGridBackground,
  ScreenContainer,
} from '@/components';

export default function SignUpScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer padded={false}>
      <NeonGridBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <Text style={[styles.eyebrow, { color: colors.accentAlt }]}>
              FORGE YOUR LEGEND
            </Text>
            <Text
              style={[
                styles.wordmark,
                {
                  color: colors.text,
                  textShadowColor: colors.accentAlt,
                },
              ]}
              accessibilityRole="header"
            >
              JOIN THE{'\n'}WAR
            </Text>
          </View>

          <View style={styles.form}>
            <GlassInput
              label="Email"
              iconLeft="email-outline"
              placeholder="warrior@prompt.gg"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
              accessibilityLabel="Email input"
            />
            <View style={{ height: Spacing.md }} />
            <GlassInput
              label="Password"
              helper="Minimum 8 characters"
              iconLeft="lock-outline"
              placeholder="Forge a passphrase"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
              accessibilityLabel="Password input"
              errorText={error || undefined}
            />
            <Text style={[styles.disclaimer, { color: colors.textTertiary }]}>
              By signing up, you confirm you are 18+ and agree to our Terms of
              Service.
            </Text>
            <GlowGradientButton
              title={loading ? 'Creating…' : 'Create Account'}
              onPress={handleSignUp}
              variant="primary"
              size="lg"
              loading={loading}
              fullWidth
              iconRight="arrow-right"
              accessibilityLabel="Sign up"
            />
            <HapticPressable
              onPress={() => router.back()}
              disabled={loading}
              haptic="selection"
              accessibilityRole="link"
              accessibilityLabel="Go back to sign in"
              style={styles.linkRow}
            >
              <Text style={[styles.linkMuted, { color: colors.textSecondary }]}>
                Already enlisted?{' '}
              </Text>
              <Text style={[styles.linkAccent, { color: colors.accent }]}>
                Sign in →
              </Text>
            </HapticPressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
  },
  brand: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  eyebrow: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.md,
  },
  wordmark: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.hero,
    lineHeight: Typography.sizes.hero,
    letterSpacing: Typography.letterSpacing.wider,
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  form: {},
  disclaimer: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    lineHeight: Typography.sizes.xs * 1.5,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  linkMuted: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
  },
  linkAccent: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
  },
});
