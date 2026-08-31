import React from 'react';
import { TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius } from '@/constants/DesignTokens';

export interface HeaderLeaveButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The way out of a battle, in the slot where back used to be.
 *
 * On move-select and round-result, "back" means leaving the battle — there is
 * nothing behind them but the tab shell. A chevron said "return to the previous
 * step", so players used it as one and silently abandoned battles that then sat
 * open until the deadline. A door icon says what the action is, and it routes
 * through the confirm dialog rather than navigating on its own.
 *
 * Presentational on purpose: the screen owns `useLeaveBattle`, because the
 * decision needs the battle's format, mode and lock state, and a self-contained
 * header button would have to open a second realtime subscription to get them.
 */
export default function HeaderLeaveButton({
  onPress,
  disabled,
}: HeaderLeaveButtonProps) {
  const colors = useThemedColors();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Leave battle"
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={[
        styles.button,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Ionicons name="exit-outline" size={18} color={colors.error} />
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
});
