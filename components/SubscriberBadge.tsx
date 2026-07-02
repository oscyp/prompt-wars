import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Typography } from '@/constants/DesignTokens';

export interface SubscriberBadgeProps {
  /** Suffix after "Prompt Wars+", e.g. "Active". Defaults to none. */
  suffix?: string;
}

/**
 * The single "Prompt Wars+" subscriber badge (sparkles icon + label).
 * Icon policy (docs/DESIGN_LANGUAGE.md): Ionicons for utility marks, never
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
      <Ionicons name="sparkles" size={12} color={colors.primary} />
      <Text style={[styles.text, { color: colors.primary }]}>{label}</Text>
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
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
});
