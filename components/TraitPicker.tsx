import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface TraitOption {
  value: string;
  label: string;
  /** Optional swatch hex for palette pickers. */
  swatch?: string;
}

interface TraitPickerProps {
  title: string;
  options: ReadonlyArray<TraitOption>;
  value: string | undefined;
  onChange: (value: string) => void;
  accessibilityHint?: string;
}

export default function TraitPicker({
  title,
  options,
  value,
  onChange,
  accessibilityHint,
}: TraitPickerProps) {
  const colors = useThemedColors();
  return (
    <View style={styles.wrapper}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={`${title}: ${opt.label}`}
              accessibilityHint={accessibilityHint}
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                {
                  backgroundColor: colors.card,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              {opt.swatch ? (
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: opt.swatch },
                  ]}
                />
              ) : null}
              <Text
                style={[
                  styles.label,
                  { color: selected ? colors.primary : colors.text },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  row: {
    paddingRight: Spacing.lg,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    marginRight: Spacing.sm,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: Spacing.sm,
  },
});
