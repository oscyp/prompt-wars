import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
export function ShopTrustFooter() {
  const colors = useThemedColors();
  return (
    <View testID="shop-trust-footer" style={styles.footer}>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
      <GameIcon name="shield-check" size={26} color={colors.textSecondary} />
      <GameText
        variant="caption"
        style={{
          color: colors.textSecondary,
          textAlign: 'center',
          flexShrink: 1,
        }}
      >
        Cosmetics never affect battle stats.
      </GameText>
      <View style={[styles.rule, { backgroundColor: colors.border }]} />
    </View>
  );
}
const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  rule: { height: 1, flex: 1, maxWidth: 60, minWidth: 8 },
});
