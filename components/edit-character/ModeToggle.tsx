import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export type DescribeMode = 'guided' | 'prompt';

export interface ModeToggleProps {
  value: DescribeMode;
  onChange: (mode: DescribeMode) => void;
  disabled?: boolean;
}

const OPTIONS: { value: DescribeMode; label: string; hint: string }[] = [
  { value: 'guided', label: 'Guided', hint: 'Build a look from traits' },
  { value: 'prompt', label: 'Your own words', hint: 'Write the description yourself' },
];

/**
 * Declares which of the two authoring modes is live.
 *
 * These are mutually exclusive and always have been — the prompt resolver reads
 * `prompt_raw` OR the traits, never both. But nothing said so, so a player who
 * had written their own description kept six trait controls that looked live and
 * were wired to nothing: they could tap Era forever and it would never reach the
 * image. A silent mode is worse than a hidden one, so the fork sits above
 * everything it governs.
 */
export default function ModeToggle({
  value,
  onChange,
  disabled = false,
}: ModeToggleProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  return (
    <View style={styles.wrap}>
      <Text style={[styles.question, accessibleText, { color: colors.text }]}>
        How should we describe your fighter?
      </Text>
      <View style={[styles.row, { borderColor: colors.border }]}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="tab"
              accessibilityLabel={`${option.label}. ${option.hint}`}
              accessibilityState={{ selected, disabled }}
              style={[
                styles.segment,
                selected && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.label,
                  accessibleText,
                  { color: selected ? '#FFFFFF' : colors.text },
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.hint, accessibleText, { color: colors.textSecondary }]}>
        {OPTIONS.find((o) => o.value === value)?.hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  question: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  row: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  hint: { fontSize: Typography.sizes.xs },
});
