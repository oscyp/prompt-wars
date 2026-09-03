import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { creditsNoun } from '@/utils/credits';
import { inkFor } from '@/utils/contrast';
import type { DailyQuest } from '@/utils/dailyMeta';

export interface QuestRowProps {
  quest: DailyQuest;
  /** The claim call for this quest is in flight. */
  claiming?: boolean;
  onClaim: (quest: DailyQuest) => void;
  /** Drops the divider under the last row of the card. */
  isLast?: boolean;
}

export interface QuestProgress {
  value: number;
  target: number;
  /** 0–1, clamped. */
  fraction: number;
  /** Done and the reward already taken. */
  completed: boolean;
  /** Target reached, reward waiting. */
  claimable: boolean;
}

/** The quest's headline; the description is a fallback, never both the same. */
export function questTitle(quest: DailyQuest): string {
  return (
    quest.quest?.title?.trim() || quest.quest?.description?.trim() || 'Quest'
  );
}

/** The second line, or null when it would only repeat the title. */
export function questDescription(quest: DailyQuest): string | null {
  const description = quest.quest?.description?.trim();
  if (!description) return null;
  if (description.toLowerCase() === questTitle(quest).toLowerCase())
    return null;
  return description;
}

export function questProgress(quest: DailyQuest): QuestProgress {
  const target = Math.max(1, quest.quest?.target_value || 1);
  const value = Math.max(0, quest.current_value || 0);
  const completed = quest.completed === true;
  return {
    value,
    target,
    fraction: completed ? 1 : Math.min(1, value / target),
    completed,
    claimable: !completed && value >= target,
  };
}

/**
 * "Win a battle, 1 of 3, +5 credits" / "Win a battle, complete". One label
 * for the whole row; the Claim button is announced on its own.
 */
export function questRowLabel(quest: DailyQuest): string {
  const title = questTitle(quest);
  const progress = questProgress(quest);
  if (progress.completed) return `${title}, complete`;
  const reward = quest.quest?.reward_credits ?? 0;
  const base = `${title}, ${progress.value} of ${progress.target}`;
  return reward > 0 && !progress.claimable
    ? `${base}, +${creditsNoun(reward)}`
    : base;
}

/**
 * One daily quest: title, description, a thin progress track and either the
 * count or the Claim button. The text and track are one accessible element;
 * the button is a sibling so it stays separately focusable.
 */
export default function QuestRow({
  quest,
  claiming = false,
  onClaim,
  isLast = false,
}: QuestRowProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const title = questTitle(quest);
  const description = questDescription(quest);
  const progress = questProgress(quest);
  const reward = quest.quest?.reward_credits ?? 0;
  const fillColor = progress.completed ? colors.success : colors.primary;
  const primaryInk = inkFor(colors.primary);

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.borderLight },
        isLast && styles.lastRow,
      ]}
    >
      <View
        style={styles.body}
        accessible
        accessibilityLabel={questRowLabel(quest)}
      >
        <View style={styles.textRow}>
          <View style={styles.text}>
            <Text
              style={[styles.title, accessibleText, { color: colors.text }]}
              numberOfLines={2}
            >
              {title}
            </Text>
            {description ? (
              <Text
                style={[
                  styles.description,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={2}
              >
                {description}
              </Text>
            ) : null}
          </View>
          {progress.completed ? (
            <View style={styles.statusRow}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={colors.success}
              />
              <Text style={[styles.status, { color: colors.success }]}>
                Complete
              </Text>
            </View>
          ) : !progress.claimable ? (
            <View style={styles.count}>
              <Text
                style={[
                  styles.countText,
                  NumericFontVariant,
                  { color: colors.text },
                ]}
              >
                {progress.value}/{progress.target}
              </Text>
              {reward > 0 ? (
                <Text
                  style={[
                    styles.reward,
                    NumericFontVariant,
                    { color: colors.primary },
                  ]}
                >
                  +{creditsNoun(reward)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View
          style={[styles.track, { backgroundColor: colors.backgroundTertiary }]}
          testID="quest-track"
        >
          <View
            testID="quest-fill"
            style={[
              styles.fill,
              {
                backgroundColor: fillColor,
                width: `${Math.round(progress.fraction * 100)}%`,
              },
            ]}
          />
        </View>
      </View>
      {progress.claimable ? (
        <TouchableOpacity
          style={[styles.claimButton, { backgroundColor: colors.primary }]}
          onPress={() => onClaim(quest)}
          disabled={claiming}
          accessibilityRole="button"
          accessibilityLabel={`Claim ${creditsNoun(reward)}`}
          accessibilityState={{ disabled: claiming, busy: claiming }}
        >
          {claiming ? (
            <ActivityIndicator size="small" color={primaryInk} />
          ) : (
            <Text
              style={[
                styles.claimText,
                NumericFontVariant,
                { color: primaryInk },
              ]}
            >
              Claim +{reward}
            </Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  body: {
    flex: 1,
    gap: Spacing.sm,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  description: {
    fontSize: Typography.sizes.sm,
  },
  count: {
    alignItems: 'flex-end',
    gap: 2,
  },
  countText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  reward: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  status: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  track: {
    height: 4,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: BorderRadius.full,
  },
  claimButton: {
    // 44pt: the design language's minimum target, met by the visible control.
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
