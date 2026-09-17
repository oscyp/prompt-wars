import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GameText as Text } from './game';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Typography } from '@/constants/DesignTokens';

export interface SubscriberBadgeProps {
  /** Suffix after "Prompt Wars+", e.g. "Active". Defaults to none. */
  suffix?: string;
}

/**
 * The single "Prompt Wars+" subscriber badge (sparkles icon + label).
 * Icon policy (docs/DESIGN_LANGUAGE.md): GameSymbol for utility marks, never
 * emoji in UI chrome.
 */
export default function SubscriberBadge({ suffix }: SubscriberBadgeProps) {
  const colors = useThemedColors();
  const label = suffix ? `Prompt Wars+ ${suffix}` : 'Prompt Wars+';
  return (
    <View
      style={styles.badge}
      accessible
      accessibilityLabel={`${label} subscription badge`}
    >
      <GameSymbol name="sparkles" size={12} color={colors.primary} />
      <Text variant="label" style={[styles.text, { color: colors.primary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    flexShrink: 1,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
});
