import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';

export interface StreakMeterProps {
  loginStreak: number;
  claimedToday: boolean;
  winStreak: number;
  bestStreak: number;
}

const WEEK = 7;

/** Whether a win streak length is itself a reward milestone: 3, 5, 7, then every 5. */
export function isWinMilestone(streak: number): boolean {
  if (streak === 3 || streak === 5 || streak === 7) return true;
  return streak >= 10 && streak % 5 === 0;
}

/**
 * The win-streak milestone the player is on or heading for. Returns `current`
 * when the streak sits ON a milestone, so the celebration line can fire — the
 * previous version always looked past the current value and never did.
 */
export function nextWinMilestone(current: number): number {
  const streak = Math.max(0, Math.floor(current));
  if (isWinMilestone(streak)) return streak;
  if (streak < 3) return 3;
  if (streak < 5) return 5;
  if (streak < 7) return 7;
  return Math.ceil(streak / 5) * 5;
}

/**
 * The 7-dot week tracker: how many dots are lit and which one is "today".
 * A streak of 0 lights nothing and outlines the first dot; the old modular
 * arithmetic mapped 0 to a full week.
 */
export function loginDots(loginStreak: number): {
  filled: number;
  today: number;
} {
  const streak = Math.max(0, Math.floor(loginStreak));
  if (streak === 0) return { filled: 0, today: 0 };
  const filled = ((streak - 1) % WEEK) + 1;
  return { filled, today: filled - 1 };
}

function days(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

function loginHint(claimedToday: boolean): string {
  return claimedToday
    ? "Today's reward claimed — come back tomorrow to keep the streak."
    : 'Come back daily — login rewards grow with your streak.';
}

function winHint(winStreak: number, bestStreak: number): string {
  const toMilestone = Math.max(0, nextWinMilestone(winStreak) - winStreak);
  if (toMilestone === 0)
    return 'Milestone reached! Win again to push your streak.';
  return `${toMilestone} more ${toMilestone === 1 ? 'win' : 'wins'} to a credit reward (best: ${bestStreak}).`;
}

/** The whole card as one screen-reader sentence; the dots have no text of their own. */
export function streakMeterLabel(props: StreakMeterProps): string {
  return [
    `Daily streak ${days(props.loginStreak)}.`,
    loginHint(props.claimedToday),
    `Win streak ${props.winStreak}, best ${props.bestStreak}.`,
    winHint(props.winStreak, props.bestStreak),
  ].join(' ');
}

/**
 * Compact engagement meter showing the daily-login streak (with a 7-day week
 * tracker) and the current win streak with its next reward milestone.
 */
export default function StreakMeter(props: StreakMeterProps) {
  const { loginStreak, claimedToday, winStreak, bestStreak } = props;
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const dots = loginDots(loginStreak);

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card }]}
      accessible
      accessibilityLabel={streakMeterLabel(props)}
    >
      <View style={styles.row}>
        <View style={styles.labelRow}>
          <Ionicons name="flame" size={18} color={colors.warning} />
          <Text style={[styles.label, accessibleText, { color: colors.text }]}>
            Daily Streak
          </Text>
        </View>
        <Text
          style={[styles.value, NumericFontVariant, { color: colors.warning }]}
        >
          {days(loginStreak)}
        </Text>
      </View>

      <View style={styles.dotsRow}>
        {Array.from({ length: WEEK }).map((_, i) => {
          const filled = i < dots.filled;
          return (
            <View
              key={i}
              testID={filled ? 'streak-dot-filled' : 'streak-dot-empty'}
              style={[
                styles.dot,
                {
                  backgroundColor: filled ? colors.warning : colors.border,
                  borderColor:
                    i === dots.today ? colors.primary : 'transparent',
                },
              ]}
            />
          );
        })}
      </View>

      <Text
        style={[styles.hint, accessibleText, { color: colors.textSecondary }]}
      >
        {loginHint(claimedToday)}
      </Text>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.row}>
        <View style={styles.labelRow}>
          <MaterialCommunityIcons
            name="sword-cross"
            size={18}
            color={colors.primary}
          />
          <Text style={[styles.label, accessibleText, { color: colors.text }]}>
            Win Streak
          </Text>
        </View>
        <Text
          style={[styles.value, NumericFontVariant, { color: colors.primary }]}
        >
          {winStreak}
        </Text>
      </View>
      <Text
        style={[styles.hint, accessibleText, { color: colors.textSecondary }]}
      >
        {winHint(winStreak, bestStreak)}
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
