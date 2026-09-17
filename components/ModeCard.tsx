import React from 'react';
import { GameText as Text, GameBevel } from './game';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, BorderRadius } from '@/constants/DesignTokens';
import { BattleModeInfo } from '@/constants/BattleModes';
import { hapticSelection } from '@/utils/haptics';

export interface ModeCardProps {
  info: BattleModeInfo;
  onPress: (mode: BattleModeInfo['mode']) => void;
  disabled?: boolean;
}

/**
 * Illustrated battle-mode row: bundled art tile, title/description, chevron.
 * Used by the mode bottom-sheet and the fallback `(tabs)/create` screen.
 */
export default function ModeCard({ info, onPress, disabled }: ModeCardProps) {
  const colors = useThemedColors();
  const isDisabled = Boolean(disabled);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          // A border alone barely registers on a dark card; the fill is what
          // tells the thumb the tap landed.
          backgroundColor: pressed ? colors.backgroundTertiary : colors.card,
          borderColor: pressed ? info.accent : colors.border,
          opacity: isDisabled ? 0.5 : 1,
        },
      ]}
      onPress={() => {
        hapticSelection();
        onPress(info.mode);
      }}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={`${info.title}. ${info.description}`}
      accessibilityState={{ disabled: isDisabled }}
    >
      <GameBevel color={colors.ornament} insetColor={colors.ornamentMuted} />
      <Image
        source={info.art}
        style={[styles.art, { borderColor: info.accent }]}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.textBlock}>
        <Text variant="title" style={[styles.title, { color: colors.text }]}>
          {info.title}
        </Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {info.description}
        </Text>
      </View>
      <GameSymbol
        name="chevron-forward"
        size={20}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 88,
  },
  art: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    marginBottom: 2,
  },
  description: {
    fontSize: 16,
  },
});
