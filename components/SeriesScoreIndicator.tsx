import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { BattleFormat } from '@/types/battle';

export interface SeriesScoreIndicatorProps {
  score: { p1: number; p2: number };
  currentRound: number;
  format: BattleFormat;
  bestOf?: number;
}

/**
 * Dot row + numeric series score header. Renders nothing in `single` format
 * because there is no series concept.
 */
export default function SeriesScoreIndicator({
  score,
  currentRound,
  format,
  bestOf,
}: SeriesScoreIndicatorProps) {
  const colors = useThemedColors();

  if (format === 'single') {
    return null;
  }

  const totalRounds = bestOf ?? 3;
  const safeRound = Math.max(1, Math.min(currentRound, totalRounds));

  const dots = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Series ${score.p1} to ${score.p2}, round ${safeRound} of ${totalRounds}`}
    >
      <View style={styles.row}>
        <Text style={[styles.score, { color: colors.text }]}>
          {score.p1}
          <Text style={{ color: colors.textSecondary }}> – </Text>
          {score.p2}
        </Text>
        <Text style={[styles.round, { color: colors.textSecondary }]}>
          Round {safeRound} of {totalRounds}
        </Text>
      </View>
      <View style={styles.dots}>
        {dots.map((n) => {
          const isCurrent = n === safeRound;
          const isPast = n < safeRound;
          return (
            <View
              key={n}
              style={[
                styles.dot,
                {
                  backgroundColor: isPast
                    ? colors.primary
                    : colors.backgroundTertiary,
                  borderColor: isCurrent ? colors.primary : colors.border,
                  borderWidth: isCurrent ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  score: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  round: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
