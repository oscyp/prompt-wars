import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Typography, BorderRadius } from '@/constants/DesignTokens';

/**
 * Custom header back button used as `headerLeft` in Stack layouts.
 *
 * Unlike the native back button (which only appears when there is a previous
 * screen in the *same* navigator), this works across navigator boundaries —
 * e.g. when pushing from a tab into a grouped stack.
 */
export default function HeaderBackButton() {
  const router = useRouter();
  const colors = useThemedColors();

  if (!router.canGoBack()) return null;

  return (
    <TouchableOpacity
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={[
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <Text style={[styles.chevron, { color: colors.text }]}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  chevron: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.semibold,
    lineHeight: Typography.sizes.xxl,
    marginTop: -4,
  },
});
