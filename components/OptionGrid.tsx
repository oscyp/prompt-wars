import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Layout,
} from '@/constants/DesignTokens';
import { hapticSelection } from '@/utils/haptics';

export interface OptionGridOption {
  value: string;
  label: string;
  /** Rendered in full under the label; also the card's accessibility hint. */
  description?: string;
  /** Hex drawn as a 14pt dot before the label (e.g. an archetype colour). */
  swatch?: string;
}

export interface OptionGridProps {
  options: readonly OptionGridOption[];
  /** `null`/`undefined` selects nothing. The grid never picks a default. */
  value: string | null | undefined;
  /** Fires only on a tap. */
  onChange: (value: string) => void;
  /**
   * Screen-reader group name; each card announces `${label}: ${option.label}`.
   * Never rendered.
   */
  label: string;
  /**
   * Visible heading for card-less layouts (onboarding, sheets). OMIT inside
   * `EditCardShell`, which draws the title itself — see the duplicate-title
   * history in EditCardShell.tsx.
   */
  title?: string;
  disabled?: boolean;
  /** Read as each card's hint while disabled, e.g. "Available in 3h". */
  disabledReason?: string;
}

/**
 * The one trait control: a two-column grid of option cards.
 *
 * Replaces two controls that disagreed with each other. Onboarding picked
 * traits from horizontal chip rows that hid options off-screen and stood
 * ~36pt tall; the edit screen used ‹ › steppers that needed up to three taps
 * to reach an option and showed one at a time. Every trait here has five or
 * six options, which fit in three rows with their descriptions readable.
 *
 * Deliberately headerless (see `title`) and it never dims itself: the
 * containers own that (`EditCardShell` and `LookPanel` already do), so
 * self-dimming would compound.
 */
export default function OptionGrid({
  options,
  value,
  onChange,
  label,
  title,
  disabled = false,
  disabledReason,
}: OptionGridProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  return (
    <View>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          {title}
        </Text>
      ) : null}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.grid}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => {
                hapticSelection();
                onChange(option.value);
              }}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityHint={disabled ? disabledReason : option.description}
              accessibilityState={{ selected, checked: selected, disabled }}
              style={[
                styles.card,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected
                    ? colors.backgroundTertiary
                    : 'transparent',
                },
              ]}
            >
              <View style={styles.labelRow}>
                {option.swatch ? (
                  <View
                    style={[styles.swatch, { backgroundColor: option.swatch }]}
                  />
                ) : null}
                <Text
                  numberOfLines={2}
                  style={[
                    styles.label,
                    accessibleText,
                    {
                      color: colors.text,
                      fontWeight: selected
                        ? Typography.weights.semibold
                        : Typography.weights.medium,
                    },
                  ]}
                >
                  {option.label}
                </Text>
                {/* Slot always reserved so labels do not shift on selection. */}
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={colors.primary}
                  style={{ opacity: selected ? 1 : 0 }}
                />
              </View>
              {option.description ? (
                <Text
                  style={[
                    styles.description,
                    accessibleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {option.description}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.sm,
  },
  card: {
    width: '48%',
    minHeight: Layout.buttonHeight,
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  label: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  description: {
    marginTop: 2,
    fontSize: Typography.sizes.xs,
    lineHeight: 16,
  },
});
