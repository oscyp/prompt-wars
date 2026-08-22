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
  title: string;
  /** Display-only cost label, e.g. 'Free' or '1 cr'. */
  costLabel: string;
  options: readonly StepperOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  /** Marks the row as staged/changed from the saved value. */
  changed?: boolean;
  disabled?: boolean;
}

/**
 * Single-value stepper (‹ Label ›) with a live description line. Used for
 * abstract traits (vibe/silhouette/era/expression) where each option has no
 * distinct thumbnail — the words are the preview, so we lead with words and
 * let the user commit to a choice they can't see until they pay to re-render.
 */
export default function TraitStepper({
  title,
  costLabel,
  options,
  value,
  onChange,
  changed = false,
  disabled = false,
}: TraitStepperProps) {
  const colors = useThemedColors();

  const index = useMemo(() => {
    const i = options.findIndex((o) => o.value === value);
    return i < 0 ? 0 : i;
  }, [options, value]);

  const current = options[index];
  const isFree = /free/i.test(costLabel);

  const step = (dir: -1 | 1) => {
    if (disabled || options.length === 0) return;
    const next = (index + dir + options.length) % options.length;
    onChange(options[next].value);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {changed ? (
            <View style={[styles.changedDot, { backgroundColor: colors.primary }]} />
          ) : null}
        </View>
        <View style={styles.costBadge}>
          <Text
            style={[
              styles.costText,
              { color: isFree ? colors.success : colors.primary },
            ]}
          >
            {costLabel}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.control,
          {
            backgroundColor: colors.card,
            borderColor: changed ? colors.primary : colors.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => step(-1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Previous ${title}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.arrow}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>

        <View
          style={styles.center}
          accessibilityRole="adjustable"
          accessibilityLabel={`${title}: ${current?.label ?? ''}`}
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
          accessibilityLabel={`Next ${title}`}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  changedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: Spacing.sm,
  },
  costBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  costText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
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
