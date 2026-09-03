import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius } from '@/constants/DesignTokens';

/** Header chips are 44pt: the design language's minimum target, not a hitSlop rescue. */
export const HEADER_BUTTON_SIZE = 44;

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
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.text} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: HEADER_BUTTON_SIZE,
    height: HEADER_BUTTON_SIZE,
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
});
