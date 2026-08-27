import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BadgePresentation } from '@/constants/Cosmetics';

export interface CosmeticBadgeProps {
  badge: BadgePresentation | null | undefined;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The player's equipped badge, shown beside their name.
 *
 * Icon-only by design: badges sit in dense rows (rankings, profile headers)
 * where a label would push the name out. The name travels in the accessibility
 * label instead, so it is never icon-only for a screen reader.
 */
export default function CosmeticBadge({
  badge,
  size = 16,
  style,
}: CosmeticBadgeProps) {
  if (!badge) return null;

  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="image"
      accessibilityLabel={`Badge: ${badge.label}`}
    >
      <Ionicons name={badge.icon} size={size} color={badge.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
