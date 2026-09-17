import React from 'react';
import type { SheetFocusRef } from '@/hooks/useSheetReturnFocus';
import { GameButton } from '@/components/game';
import { GamePanel, GameText } from '@/components/game';

import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface SaveBarProps {
  changeCount: number;
  busy?: boolean;
  onSave: (opener: SheetFocusRef) => void;
  onClear: () => void;
}

/**
 * One commit point for everything staged across Identity, Look and Gear.
 *
 * Carries no price, because describing a character costs nothing: the money is
 * on the render button in the hero. What this bar is for is the other kind of
 * cost — name locks for 7 days, archetype for 14 — which the confirmation
 * spells out before anything is written.
 */
export default function SaveBar({
  changeCount,
  busy = false,
  onSave,
  onClear,
}: SaveBarProps) {
  const saveRef = React.useRef<View>(null);
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();

  return (
    <GamePanel
      tone="ornate"
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: insets.bottom + Spacing.md,
        },
      ]}
    >
      <View style={styles.summary}>
        <GameText
          variant="title"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          {changeCount} change{changeCount === 1 ? '' : 's'}
        </GameText>
        <GameText
          variant="caption"
          style={[styles.sub, accessibleText, { color: colors.textSecondary }]}
        >
          Free
        </GameText>
      </View>
      <GameButton
        onPress={onClear}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Discard staged changes"
        style={styles.clear}
        tone="secondary"
        label="Clear"
      />
      <GameButton
        ref={saveRef}
        onPress={() => onSave(saveRef)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Save ${changeCount} change${changeCount === 1 ? '' : 's'}`}
        accessibilityState={{ disabled: busy }}
        style={[
          styles.save,
          { backgroundColor: colors.primary },
          busy && styles.disabled,
        ]}
        label="Save changes"
        busy={busy}
      />
    </GamePanel>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summary: { flex: 1 },
  title: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  sub: {
    marginTop: 1,
    fontSize: Typography.sizes.sm,
  },
  clear: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  clearText: {
    fontSize: Typography.sizes.sm,
  },
  save: {
    minHeight: 48,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  disabled: { opacity: 0.5 },
});
