import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GamePanel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { GameChrome, Spacing } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';

export function WritingTips({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const colors = useThemedColors();
  return (
    <GamePanel tone="quiet" style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Writing tips"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <GameIcon name="help" size={24} color={colors.primary} />
        <GameText
          variant="label"
          style={[styles.label, { color: colors.primary }]}
        >
          Writing tips
        </GameText>
        <View
          style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}
        >
          <GameIcon name="chevron-right" size={20} color={colors.primary} />
        </View>
      </Pressable>
      {expanded ? (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          {children}
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
    gap: 10,
  },
  label: { flex: 1 },
  pressed: { opacity: 0.75 },
  body: {
    marginHorizontal: Spacing.md,
    paddingTop: 14,
    paddingBottom: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
});
