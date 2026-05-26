import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  color: string;
}

/**
 * Simple stat bar with label, numeric value and segmented fill. Uses both
 * color and numeric value so screen readers and color-blind users get parity.
 */
export default function StatBar({ label, value, max = 10, color }: StatBarProps) {
  const colors = useThemedColors();
  const safeMax = Math.max(1, max);
  const clamped = Math.max(0, Math.min(value, safeMax));
  const pct = clamped / safeMax;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${clamped} out of ${safeMax}`}
      accessibilityValue={{ min: 0, max: safeMax, now: clamped }}
    >
      <View style={styles.row}>
        <Text
          style={[styles.label, { color: colors.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text style={[styles.value, { color: colors.textSecondary }]}>
          {clamped}/{safeMax}
        </Text>
      </View>
      <View
        style={[
          styles.track,
          {
            backgroundColor: colors.backgroundTertiary,
            borderColor: colors.border,
          },
        ]}
      >
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: Typography.sizes.sm,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});
