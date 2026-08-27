import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface StepperOption {
  value: string;
  label: string;
  /** One-line description shown under the label — the "preview" for a trait. */
  description?: string;
  /** Optional swatch hex (palette-style traits). */
  swatch?: string;
}

interface TraitStepperProps {
  /**
   * Names the trait for screen readers only — never rendered.
   *
   * The card above draws the visible title, but that is a separate element, so
   * without this the arrows announce as a bare "Previous" and the value as an
   * unlabelled adjustable. Four identical steppers in a row then sound the same.
   */
  label: string;
  options: readonly StepperOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Single-value stepper (‹ Label ›) with a live description line. Used for
 * abstract traits (vibe/silhouette/era/expression) where each option has no
 * distinct thumbnail — the words are the preview.
 *
 * Deliberately headerless. It used to draw its own title, staged dot and cost
 * badge, which became a visible duplicate the moment it was nested inside
 * `EditCardShell` — every trait card rendered "Era ● 1 cr" twice. The card owns
 * the label and the state; this owns the control.
 */
export default function TraitStepper({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: TraitStepperProps) {
  const colors = useThemedColors();

  const index = useMemo(() => {
    const i = options.findIndex((o) => o.value === value);
    return i < 0 ? 0 : i;
  }, [options, value]);

  const current = options[index];

  const step = (dir: -1 | 1) => {
    if (disabled || options.length === 0) return;
    const next = (index + dir + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.control,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => step(-1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Previous ${label}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.arrow}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View
          style={styles.center}
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}: ${current?.label ?? ''}`}
          accessibilityHint={current?.description}
        >
          <View style={styles.centerLabelRow}>
            {current?.swatch ? (
              <View
                style={[styles.swatch, { backgroundColor: current.swatch }]}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[styles.centerLabel, { color: colors.text }]}
            >
              {current?.label ?? '—'}
            </Text>
          </View>
          {current?.description ? (
            <Text
              numberOfLines={2}
              style={[styles.description, { color: colors.textSecondary }]}
            >
              {current.description}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => step(1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Next ${label}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.arrow}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.dots}>
        {options.map((o, i) => (
          <View
            key={o.value}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i === index ? colors.primary : colors.border,
                width: i === index ? 16 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.lg,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    minHeight: 76,
    paddingHorizontal: Spacing.xs,
  },
  arrow: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  centerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: Spacing.sm,
  },
  centerLabel: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  description: {
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: Spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
