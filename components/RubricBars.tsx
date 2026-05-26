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

const RUBRIC_LABELS: Record<keyof RubricScoreSet, string> = {
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
 */
export default function RubricBars({
  scores,
  opponentScores,
  max = 10,
}: RubricBarsProps) {
  const colors = useThemedColors();
  const keys = Object.keys(RUBRIC_LABELS) as (keyof RubricScoreSet)[];
  const safeMax = Math.max(1, max);

  return (
    <View style={styles.wrap}>
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
              {opp != null ? (
                <View
                  style={[
                    styles.oppMarker,
                    {
                      left: `${(opp / safeMax) * 100}%`,
                      backgroundColor: colors.textSecondary,
                    },
                  ]}
                />
              ) : null}
            </View>
            <Text
              style={[styles.value, { color: colors.textSecondary }]}
            >
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
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  oppMarker: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 14,
  },
  value: {
    fontSize: Typography.sizes.xs,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
