import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import AnimatedCounter from './AnimatedCounter';

export interface CreditChipProps {
  credits: number;
  /**
   * The balance could not be read. Shows a dash instead of a number so the
   * chip never claims "0 credits" on a network failure; still opens the
   * wallet, which is where the player can retry.
   */
  unavailable?: boolean;
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
export default function CreditChip({
  credits,
  unavailable = false,
  onPress,
}: CreditChipProps) {
  const colors = useThemedColors();
  const router = useRouter();

  return (
    <Pressable
      onPress={onPress ?? (() => router.push('/(profile)/wallet'))}
      accessibilityRole="button"
      accessibilityLabel={
        unavailable
          ? 'View wallet, balance unavailable'
          : `View wallet, ${credits} credits`
      }
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
      {unavailable ? (
        <Text
          style={[
            styles.text,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          —
        </Text>
      ) : (
        <AnimatedCounter
          value={credits}
          style={[styles.text, { color: colors.text }]}
          accessibilityLabel={`${credits} credits`}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    // 44pt: the design language's minimum target, met by the visible control.
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
