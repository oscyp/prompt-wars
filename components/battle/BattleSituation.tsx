import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GamePanel, GameText } from '@/components/game';
import { BattleThemePlaque } from '@/components/game/battle/BattleThemePlaque';
import type { SituationSnapshot } from '@/types/battle';
import { useThemedColors } from '@/hooks/useThemedColors';

export function BattleSituation({
  situation,
  theme,
  compact = false,
  footer,
}: {
  situation: SituationSnapshot | null | undefined;
  theme?: string | null;
  compact?: boolean;
  /** Round status shares this panel rather than adding another frame. */
  footer?: React.ReactNode;
  /** Later composer views keep the complete scene available without taking over the form. */
  collapsible?: boolean;
  /** Kept for older callers; inspiration filters are no longer rendered. */
  affordances?: readonly { id: string; label: string }[];
  selectedAffordance?: string | null;
  onSelectAffordance?: (id: string | null) => void;
}) {
  const colors = useThemedColors();
  return (
    <GamePanel tone={compact ? 'quiet' : 'ornate'} style={styles.panel}>
      {theme ? (
        <BattleThemePlaque theme={theme} compact={compact} framed={false} />
      ) : null}
      <GameText variant="label" accessibilityRole="header">
        SHARED SITUATION
      </GameText>
      <GameText selectable>
        {situation?.text ?? 'Loading the shared situation…'}
      </GameText>
      {footer ? (
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {footer}
        </View>
      ) : null}
    </GamePanel>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 8, marginVertical: 8 },
  footer: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
