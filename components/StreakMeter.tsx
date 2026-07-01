import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius, NumericFontVariant } from '@/constants/DesignTokens';

export interface StreakMeterProps {
  loginStreak: number;
  claimedToday: boolean;
  winStreak: number;
  bestStreak: number;
}

/** Next win-streak milestone: 3, 5, 7, then every +5. */
function nextWinMilestone(current: number): number {
  if (current < 3) return 3;
  if (current < 5) return 5;
  if (current < 7) return 7;
  return Math.ceil((current + 1) / 5) * 5;
}

/**
 * Compact engagement meter showing the daily-login streak (with a 7-day week
 * tracker) and the current win streak with its next reward milestone.
 */
export default function StreakMeter({
  loginStreak,
  claimedToday,
  winStreak,
  bestStreak,
}: StreakMeterProps) {
  const colors = useThemedColors();
  const weekDay = ((loginStreak - 1) % 7 + 7) % 7;
  const milestone = nextWinMilestone(winStreak);
  const toMilestone = Math.max(0, milestone - winStreak);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.row}>
        <View style={styles.labelRow}>
          <Ionicons name="flame" size={18} color={colors.warning} />
          <Text style={[styles.label, { color: colors.text }]}>Daily Streak</Text>
        </View>
        <Text style={[styles.value, NumericFontVariant, { color: colors.warning }]}>
          {loginStreak} {loginStreak === 1 ? 'day' : 'days'}
        </Text>
      </View>

      <View style={styles.dotsRow}>
        {Array.from({ length: 7 }).map((_, i) => {
          const filled = i <= weekDay;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: filled ? colors.warning : colors.border,
                  borderColor: i === weekDay ? colors.primary : 'transparent',
                },
              ]}
            />
          );
        })}
      </View>

      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {claimedToday
          ? "Today's reward claimed — come back tomorrow to keep the streak."
          : 'Open daily to claim escalating credit rewards.'}
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.row}>
        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="sword-cross"
            size={18}
            color={colors.primary}
          />
          <Text style={[styles.label, { color: colors.text }]}>Win Streak</Text>
        </View>
        <Text style={[styles.value, NumericFontVariant, { color: colors.primary }]}>
          {winStreak}
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {toMilestone === 0
          ? 'Milestone reached! Win again to push your streak.'
          : `${toMilestone} more ${toMilestone === 1 ? 'win' : 'wins'} to a +credits milestone (best: ${bestStreak}).`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  value: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dot: {
    flex: 1,
    height: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  hint: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.xs,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
});
