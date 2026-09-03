import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import { BattleFormat } from '@/types/battle';

export interface SeriesScoreIndicatorProps {
  /** Rounds won, in the server's player-one / player-two order. */
  score: { p1: number; p2: number };
  currentRound: number;
  format: BattleFormat;
  bestOf?: number;
  /**
   * Which side the viewer is. The score is always shown as "you – opponent",
   * so player two sees a 2–1 lead as 2–1, not as the raw 1–2 the row stores.
   * Defaults to player one for the legacy call sites that never said.
   */
  viewer?: 'p1' | 'p2';
}

/** The series score from one side's point of view. */
export function orientSeriesScore(
  score: { p1: number; p2: number },
  viewer: 'p1' | 'p2',
): { mine: number; theirs: number } {
  return viewer === 'p1'
    ? { mine: score.p1, theirs: score.p2 }
    : { mine: score.p2, theirs: score.p1 };
}

/**
 * Series score header + round dots. Renders nothing in `single` format
 * because there is no series concept.
 *
 * Both numbers are labelled, because a bare "1 – 2" beneath HP bars that DO
 * say "You" and "Opponent" left player two reading their own lead as a deficit.
 */
export default function SeriesScoreIndicator({
  score,
  currentRound,
  format,
  bestOf,
  viewer = 'p1',
}: SeriesScoreIndicatorProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  if (format === 'single') {
    return null;
  }

  const totalRounds = bestOf ?? 3;
  const safeRound = Math.max(1, Math.min(currentRound, totalRounds));
  const { mine, theirs } = orientSeriesScore(score, viewer);

  const dots = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`Series: you ${mine}, opponent ${theirs}. Round ${safeRound} of ${totalRounds}.`}
    >
      <View style={styles.row}>
        <View style={styles.scoreBlock}>
          <View style={styles.scoreCol}>
            <Text
              style={[styles.score, NumericFontVariant, { color: colors.text }]}
            >
              {mine}
            </Text>
            <Text
              style={[
                styles.who,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              You
            </Text>
          </View>
          <Text style={[styles.dash, { color: colors.textTertiary }]}>–</Text>
          <View style={styles.scoreCol}>
            <Text
              style={[styles.score, NumericFontVariant, { color: colors.text }]}
            >
              {theirs}
            </Text>
            <Text
              style={[
                styles.who,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              Opponent
            </Text>
          </View>
        </View>
        <Text
          style={[
            styles.round,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  scoreCol: {
    alignItems: 'center',
    minWidth: 40,
  },
  score: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  dash: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    lineHeight: Typography.sizes.xxl * 1.2,
  },
  who: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  round: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    paddingBottom: Spacing.xs,
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
