import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GamePanel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { GameChrome, Spacing } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { MoveType } from '@/utils/battles';

const LABELS: Record<MoveType, string> = {
  attack: 'Attack',
  defense: 'Defense',
  finisher: 'Finisher',
};

/** Read-only parent choices; opening the recap never changes the move. */
export function ComposerChoiceRecap({
  moveType,
  actionText,
  intentText,
}: {
  moveType: MoveType | null;
  actionText: string;
  intentText?: string;
}) {
  const colors = useThemedColors();
  const [expanded, setExpanded] = useState(false);
  const moveLabel = moveType ? LABELS[moveType] : 'Your move';
  const fields = intentText ? 'Action + Intention' : 'Action';

  return (
    <GamePanel tone="quiet" style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your choices. ${moveLabel}. ${intentText ? 'Action and intention' : 'Action'}.`}
        accessibilityHint="Shows or hides your selected text."
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.heading}>
          <GameText variant="label" style={{ color: colors.primary }}>
            Your choices
          </GameText>
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            {moveLabel} · {fields}
          </GameText>
        </View>
        <View
          style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}
        >
          <GameIcon name="chevron-right" size={20} color={colors.primary} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          <View style={styles.field}>
            <GameText
              variant="label"
              accessibilityRole="header"
              style={{ color: colors.textSecondary }}
            >
              Action
            </GameText>
            <GameText>{actionText}</GameText>
          </View>
          {intentText ? (
            <View
              style={[
                styles.field,
                styles.intention,
                { borderTopColor: colors.border },
              ]}
            >
              <GameText
                variant="label"
                accessibilityRole="header"
                style={{ color: colors.textSecondary }}
              >
                Intention
              </GameText>
              <GameText>{intentText}</GameText>
            </View>
          ) : null}
        </View>
      ) : null}
    </GamePanel>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 0 },
  header: {
    minHeight: GameChrome.minControlSize + Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heading: { flex: 1, minWidth: 0, gap: Spacing.xs },
  pressed: { opacity: 0.75 },
  body: {
    marginHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    paddingBottom: Spacing.md,
    gap: 14,
  },
  field: { gap: Spacing.xs },
  intention: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
});
