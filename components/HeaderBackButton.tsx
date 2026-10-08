import { GameText as Text } from '@/components/game';
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useRouter, useSegments } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Header targets stay at least 48pt and grow with fallback text. */
export const HEADER_BUTTON_SIZE = 48;

/**
 * Custom header back button used as `headerLeft` in Stack layouts.
 *
 * Unlike the native back button (which only appears when there is a previous
 * screen in the *same* navigator), this works across navigator boundaries —
 * e.g. when pushing from a tab into a grouped stack.
 */
export default function HeaderBackButton({
  onPress,
  disabled = false,
}: {
  onPress?: () => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const colors = useThemedColors();

  const segments = useSegments();
  const fallback =
    segments[0] === '(profile)' ? '/(tabs)/profile' : '/(tabs)/home';

  const canGoBack = router.canGoBack();
  const fallbackLabel = segments[0] === '(profile)' ? 'Profile' : 'Arena';

  return (
    <TouchableOpacity
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={
        onPress ??
        (() => (router.canGoBack() ? router.back() : router.replace(fallback)))
      }
      accessibilityRole="button"
      accessibilityLabel={canGoBack ? 'Go back' : `Return to ${fallbackLabel}`}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.button}
    >
      <GameIcon name="chevron-left" size={20} color={colors.ornament} />
      <Text variant="label" style={{ color: colors.primary, flexShrink: 1 }}>
        {canGoBack ? 'Back' : fallbackLabel}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: HEADER_BUTTON_SIZE,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 4,
    minHeight: HEADER_BUTTON_SIZE,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
