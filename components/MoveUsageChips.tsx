import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import type { MoveType } from '@/utils/battles';
import { moveLabel } from '@/utils/battleCopy';
import { inkFor } from '@/utils/contrast';
import type { MoveUsage } from '@/utils/statsInsights';

export interface MoveUsageChipsProps {
  usage: readonly MoveUsage[];
  /** Shown when the player has not locked a prompt yet. */
  emptyText: string;
}

/** "42%" */
export function moveShareLabel(share: number): string {
  return `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;
}

/** "won 60% of rounds" / "no rounds yet" */
export function roundWinRateLabel(winRate: number | null): string {
  if (winRate === null) return 'no rounds yet';
  return `won ${Math.round(Math.max(0, Math.min(1, winRate)) * 100)}% of rounds`;
}

/** What a screen reader says for one chip. */
export function moveChipLabel(usage: MoveUsage): string {
  return `${moveLabel(usage.move)}: ${moveShareLabel(usage.share)} of your moves, ${roundWinRateLabel(usage.winRate)}`;
}

/**
 * One chip per move type: the move's icon on its colour (shape and colour,
 * never colour alone), its share of the player's locked prompts and how often
 * rounds with it were won. Information only, so chips are not 44pt targets;
 * each is one accessible node.
 */
export default function MoveUsageChips({
  usage,
  emptyText,
}: MoveUsageChipsProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const total = usage.reduce((n, u) => n + u.count, 0);

  if (usage.length === 0 || total === 0) {
    return (
      <Text
        style={[styles.empty, accessibleText, { color: colors.textSecondary }]}
      >
        {emptyText}
      </Text>
    );
  }

  const palette: Record<MoveType, string> = {
    attack: colors.attack,
    defense: colors.defense,
    finisher: colors.finisher,
  };

  return (
    <View style={styles.row}>
      {usage.map((u) => {
        const accent = palette[u.move];
        return (
          <View
            key={u.move}
            accessible
            accessibilityLabel={moveChipLabel(u)}
            style={[
              styles.chip,
              {
                backgroundColor: colors.backgroundTertiary,
                borderColor: accent,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: accent }]}>
              <Ionicons
                name={MOVE_META[u.move].icon}
                size={14}
                color={inkFor(accent)}
              />
            </View>
            <View style={styles.text}>
              <View style={styles.headline}>
                <Text
                  style={[styles.name, accessibleText, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {moveLabel(u.move)}
                </Text>
                <Text
                  style={[
                    styles.share,
                    NumericFontVariant,
                    { color: colors.text },
                  ]}
                >
                  {moveShareLabel(u.share)}
                </Text>
              </View>
              <Text
                style={[
                  styles.detail,
                  NumericFontVariant,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {roundWinRateLabel(u.winRate)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexGrow: 1,
    flexBasis: 150,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingLeft: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  name: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  share: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  detail: {
    fontSize: Typography.sizes.xs,
  },
  empty: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
  },
});
