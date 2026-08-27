import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import AnimatedCounter from './AnimatedCounter';

export interface CreditChipProps {
  credits: number;
  /** Where a tap goes. Defaults to the wallet. */
  onPress?: () => void;
}

/**
 * Credit balance, tappable through to the wallet.
 *
 * The edit screen showed this as inert text while telling players to "top up in
 * the shop", leaving them to find the wallet on their own from a screen with no
 * route to it. Matches the home-screen chip's behaviour.
 */
export default function CreditChip({ credits, onPress }: CreditChipProps) {
  const colors = useThemedColors();
  const router = useRouter();

  return (
    <Pressable
      onPress={onPress ?? (() => router.push('/(profile)/wallet'))}
      accessibilityRole="button"
      accessibilityLabel={`View wallet, ${credits} credits`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name="sparkles" size={13} color={colors.primary} />
      <AnimatedCounter
        value={credits}
        style={[styles.text, { color: colors.text }]}
        accessibilityLabel={`${credits} credits`}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 32,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
