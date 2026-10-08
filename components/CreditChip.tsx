import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CreditAmount } from './game/CreditAmount';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';

export interface CreditChipProps {
  credits: number;
  focusRef?: React.RefObject<View | null>;
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
  focusRef,
  unavailable = false,
  onPress,
}: CreditChipProps) {
  const colors = useThemedColors();
  const router = useRouter();

  return (
    <Pressable
      ref={focusRef}
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
          backgroundColor: 'transparent',
          borderColor: colors.ornamentMuted,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <CreditAmount amount={unavailable ? null : credits} accessible={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 48,
    minWidth: 48,
    maxWidth: '100%',
    paddingHorizontal: Spacing.sm,
  },
  text: {
    flexShrink: 1,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
  },
});
