import { GameText as Text } from '@/components/game';
import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useRouter, useSegments } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius } from '@/constants/DesignTokens';

/** Header targets stay at least 48pt and grow with fallback text. */
export const HEADER_BUTTON_SIZE = 48;

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

  const segments = useSegments();
  const fallback =
    segments[0] === '(profile)' ? '/(tabs)/profile' : '/(tabs)/home';

  const canGoBack = router.canGoBack();
  const fallbackLabel = segments[0] === '(profile)' ? 'Profile' : 'Arena';

  return (
    <TouchableOpacity
      onPress={() =>
        router.canGoBack() ? router.back() : router.replace(fallback)
      }
      accessibilityRole="button"
      accessibilityLabel={canGoBack ? 'Go back' : `Return to ${fallbackLabel}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.button,
        !canGoBack && {
          width: undefined,
          paddingHorizontal: 12,
          flexDirection: 'row',
          gap: 6,
        },
        {
          backgroundColor: colors.card,
          borderColor: colors.ornamentMuted,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <GameSymbol name="chevron-back" size={22} color={colors.text} />
      {!canGoBack && (
        <Text style={{ color: colors.text }}>{fallbackLabel}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: HEADER_BUTTON_SIZE,
    minHeight: HEADER_BUTTON_SIZE,
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
