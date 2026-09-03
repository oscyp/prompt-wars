import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { RubricScoreSet } from '@/types/battle';

export interface RubricBarsProps {
  scores: Partial<RubricScoreSet>;
  /** Optional opponent scores to render alongside for comparison. */
  opponentScores?: Partial<RubricScoreSet>;
  /** Display max for the normalized scale; rubric scores are 0–10. */
  max?: number;
}

export const RUBRIC_LABELS: Record<keyof RubricScoreSet, string> = {
  clarity: 'Clarity',
  originality: 'Originality',
  specificity: 'Specificity',
  theme_fit: 'Theme Fit',
  archetype_fit: 'Archetype Fit',
  dramatic_potential: 'Dramatic Potential',
};

/**
 * Renders rubric category bars. Labels are NOT truncated (Dynamic Type
 * support).
 *
 * The opponent is a second, thinner bar under the player's rather than a tick
 * on the same track: the old 2pt marker in `textSecondary` vanished against
 * the fill whenever the two scores were close, which is exactly when a player
 * wants to compare them. Two bars differ in position and length, so the
 * comparison never depends on colour alone.
 */
export default function RubricBars({
  scores,
  opponentScores,
  max = 10,
}: RubricBarsProps) {
  const colors = useThemedColors();
  const keys = Object.keys(RUBRIC_LABELS) as (keyof RubricScoreSet)[];
  const safeMax = Math.max(1, max);
  const hasOpponent = Boolean(opponentScores);

  return (
    <View style={styles.wrap}>
      {hasOpponent ? (
        <View
          style={styles.legend}
          accessible
          accessibilityLabel="Legend: the thick bar is your score, the thin bar below it is the opponent's"
        >
          <View
            style={[styles.legendSwatch, { backgroundColor: colors.primary }]}
            importantForAccessibility="no"
          />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Your score
          </Text>
          <Text style={[styles.legendText, { color: colors.textTertiary }]}>
            ·
          </Text>
          <View
            style={[
              styles.legendSwatch,
              styles.legendSwatchThin,
              { backgroundColor: colors.textTertiary },
            ]}
            importantForAccessibility="no"
          />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Opponent
          </Text>
        </View>
      ) : null}
      {keys.map((k) => {
        const me = clamp(scores[k] ?? 0, safeMax);
        const opp = opponentScores
          ? clamp(opponentScores[k] ?? 0, safeMax)
          : null;
        return (
          <View
            key={k}
            style={styles.row}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={
              opp != null
                ? `${RUBRIC_LABELS[k]}: you ${me.toFixed(1)} out of ${safeMax}, opponent ${opp.toFixed(1)}`
                : `${RUBRIC_LABELS[k]}: ${me.toFixed(1)} out of ${safeMax}`
            }
            accessibilityValue={{ min: 0, max: safeMax, now: me }}
          >
            <Text style={[styles.label, { color: colors.text }]}>
              {RUBRIC_LABELS[k]}
            </Text>
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
                  {
                    width: `${(me / safeMax) * 100}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
            {opp != null ? (
              <View
                style={[
                  styles.track,
                  styles.oppTrack,
                  {
                    backgroundColor: colors.backgroundTertiary,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${(opp / safeMax) * 100}%`,
                      backgroundColor: colors.textTertiary,
                    },
                  ]}
                />
              </View>
            ) : null}
            <Text style={[styles.value, { color: colors.textSecondary }]}>
              {me.toFixed(1)}
              {opp != null ? ` vs ${opp.toFixed(1)}` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function clamp(n: number, max: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(n, max));
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  legendSwatch: {
    width: 14,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  legendSwatchThin: {
    height: 4,
  },
  legendText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  row: {
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginBottom: 2,
  },
  track: {
    height: 10,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  oppTrack: {
    height: 4,
    marginTop: 3,
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  value: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
