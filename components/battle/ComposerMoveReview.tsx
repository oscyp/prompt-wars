import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GameIcon, GamePanel, GameText } from '@/components/game';
import { Spacing } from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  composerCanSubmit,
  type ComposerSnapshot,
} from '@/utils/promptComposer';

/** Only divide a builder prompt when its fragments match the exact final text. */
export function ComposerMoveReview({
  state,
  testID,
}: {
  state: ComposerSnapshot;
  testID?: string;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const moveType = state.moveType;
  const moveLabel =
    moveType === 'attack'
      ? 'Attack'
      : moveType === 'defense'
        ? 'Defense'
        : 'Finisher';
  const fragments =
    state.mode === 'build' && composerCanSubmit(state)
      ? [
          { label: 'Action', text: state.actionText.trim() },
          { label: 'Intention', text: state.intentText.trim() },
          { label: 'Approach', text: state.approachText.trim() },
        ]
      : null;

  return (
    <GamePanel tone="quiet" testID={testID} style={styles.panel}>
      {moveType ? (
        <View style={[styles.moveHeader, { borderBottomColor: colors.border }]}>
          <GameIcon
            name={MOVE_META[moveType].gameIcon}
            size={20}
            color={colors[moveType]}
          />
          <GameText
            variant="label"
            accessibilityRole="header"
            accessibilityLabel={`Move type: ${moveLabel}`}
            style={styles.moveLabel}
          >
            {moveLabel}
          </GameText>
        </View>
      ) : null}
      {fragments ? (
        fragments.map((fragment, index) => (
          <View
            key={fragment.label}
            style={[
              styles.section,
              index > 0 && [styles.divider, { borderTopColor: colors.border }],
            ]}
          >
            <GameText
              variant="label"
              accessibilityRole="header"
              style={{ color: colors.textSecondary }}
            >
              {fragment.label}
            </GameText>
            <GameText selectable style={accessibleText}>
              {fragment.text}
            </GameText>
          </View>
        ))
      ) : (
        <GameText selectable style={accessibleText}>
          {state.finalText}
        </GameText>
      )}
    </GamePanel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14 },
  moveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moveLabel: { flex: 1, minWidth: 0, fontSize: 20 },
  section: { gap: Spacing.xs },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
});
