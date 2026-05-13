import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius, Spacing, Typography } from '@/constants/DesignTokens';

interface StatChipProps {
  label: string;
  value: string | number;
  accent?: string;
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

/**
 * A compact label/value pill used in grids and inline summaries.
 */
export default function StatChip({
  label,
  value,
  accent,
  align = 'center',
  size = 'md',
  style,
}: StatChipProps) {
  const colors = useThemedColors();
  const valueSize =
    size === 'lg'
      ? Typography.sizes.display2
      : size === 'sm'
        ? Typography.sizes.xl
        : Typography.sizes.xxl;

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.glassBorder,
          alignItems: align === 'center' ? 'center' : 'flex-start',
        },
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        style={{
          color: accent ?? colors.text,
          fontFamily: Typography.fonts.display,
          fontSize: valueSize,
          letterSpacing: Typography.letterSpacing.wide,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: colors.textTertiary,
          fontFamily: Typography.fonts.bodyMedium,
          fontSize: Typography.sizes.xs,
          letterSpacing: Typography.letterSpacing.widest,
          textTransform: 'uppercase',
          marginTop: Spacing.xs,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    minHeight: 72,
    justifyContent: 'center',
  },
});
