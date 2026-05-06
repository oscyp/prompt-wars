import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';

export default function CreateScreen() {
  const router = useRouter();
  const colors = useThemedColors();

  const startBattle = (mode: 'ranked' | 'unranked' | 'bot') => {
    // Navigate to matchmaking with mode parameter
    router.push(`/(battle)/matchmaking?mode=${mode}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Start a Battle</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Choose your battle mode
      </Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => startBattle('ranked')}
          accessibilityLabel="Start ranked battle"
          accessibilityRole="button"
        >
          <Text style={styles.buttonEmoji}>⚔️</Text>
          <Text style={styles.buttonText}>Ranked Battle</Text>
          <Text style={styles.buttonDescription}>Compete for ranking points</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.primary }]}
          onPress={() => startBattle('unranked')}
          accessibilityLabel="Start unranked battle"
          accessibilityRole="button"
        >
          <Text style={styles.buttonEmoji}>🎯</Text>
          <Text style={[styles.buttonTextSecondary, { color: colors.text }]}>Unranked Battle</Text>
          <Text style={[styles.buttonDescription, { color: colors.textSecondary }]}>
            Practice without rating changes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border }]}
          onPress={() => startBattle('bot')}
          accessibilityLabel="Practice against bot"
          accessibilityRole="button"
        >
          <Text style={styles.buttonEmoji}>🤖</Text>
          <Text style={[styles.buttonTextSecondary, { color: colors.text }]}>Practice vs Bot</Text>
          <Text style={[styles.buttonDescription, { color: colors.textSecondary }]}>
            Learn the basics against AI
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xxl,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: Spacing.md,
  },
  button: {
    padding: Spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonEmoji: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  buttonTextSecondary: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  buttonDescription: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
});
