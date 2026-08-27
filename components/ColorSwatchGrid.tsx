import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface ColorSwatchOption {
  /** Stable identity: a palette key, or the hex itself for a legacy colour. */
  value: string;
  label: string;
  hex: string;
}

export interface ColorSwatchGridProps {
  options: ColorSwatchOption[];
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown in place of the hint when disabled, e.g. "Available in 3h". */
  disabledReason?: string;
  /** Announced as part of each swatch's label, e.g. "Signature colour". */
  groupLabel: string;
}

/**
 * Colour picker used by both Signature colour and Outfit palette.
 *
 * Replaces two near-identical 36pt swatch rows that were below the 44pt target,
 * carried no `hitSlop`, and signalled selection with a border alone -- a
 * colour-only cue on a control whose entire content is colour. Selection now
 * also carries a checkmark and a visible label.
 *
 * Callers are expected to append an option for a stored colour that matches no
 * preset (see `withCustomOption`); a legacy hex used to render as simply
 * nothing selected.
 */
export default function ColorSwatchGrid({
  options,
  value,
  onChange,
  disabled = false,
  disabledReason,
  groupLabel,
}: ColorSwatchGridProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const selected = options.find((o) => o.value === value);

  return (
    <View>
      <View style={[styles.row, disabled && styles.dimmed]}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${groupLabel}: ${option.label}`}
              accessibilityState={{ selected: isSelected, disabled }}
              accessibilityHint={disabled ? disabledReason : undefined}
              style={styles.target}
            >
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: option.hex,
                    borderColor: isSelected ? colors.text : 'transparent',
                  },
                ]}
              >
                {isSelected ? (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text
        style={[
          styles.caption,
          accessibleText,
          { color: disabled ? colors.warning : colors.textSecondary },
        ]}
      >
        {disabled && disabledReason
          ? disabledReason
          : (selected?.label ?? 'None selected')}
      </Text>
    </View>
  );
}

/**
 * Appends the character's current colour as a "Custom" option when it matches
 * none of the presets, so an older character does not appear to have no colour.
 */
export function withCustomOption(
  options: ColorSwatchOption[],
  current: string | null | undefined,
): ColorSwatchOption[] {
  if (!current) return options;
  const normalized = current.toLowerCase();
  if (options.some((o) => o.hex.toLowerCase() === normalized)) return options;
  if (!/^#[0-9a-fA-F]{6}$/.test(current)) return options;
  return [...options, { value: current, label: 'Custom', hex: current }];
}

/** Maps a stored hex back to the option `value` that represents it. */
export function selectedValueForHex(
  options: ColorSwatchOption[],
  hex: string | null | undefined,
): string | null {
  if (!hex) return null;
  const normalized = hex.toLowerCase();
  return options.find((o) => o.hex.toLowerCase() === normalized)?.value ?? null;
}

const SWATCH = 44;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  dimmed: {
    opacity: 0.45,
  },
  target: {
    minWidth: SWATCH,
    minHeight: SWATCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: BorderRadius.full,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.xs,
  },
});
