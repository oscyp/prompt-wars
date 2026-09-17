import React, { useId } from 'react';
import { Pressable, View, Image, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameBevel } from './GameBevel';
import { GameIcon } from './icons/GameIcon';
import { GameText } from './GameText';

export function GameAttentionStrip({
  title,
  subtitle,
  eyebrow,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  const id = `attention-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[StyleSheet.absoluteFill, { overflow: 'hidden', margin: 3 }]}
      >
        <Image
          source={require('../../assets/images/arenas/astral-temple.jpg')}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { left: '25%', width: '75%' }]}
        />
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.card} />
              <Stop offset="0.55" stopColor={colors.card} stopOpacity={0.94} />
              <Stop offset="1" stopColor={colors.card} stopOpacity={0.45} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
      <GameBevel color={colors.ornament} insetColor={colors.ornamentMuted} />
      <GameIcon name="scroll" size={34} color={colors.ornament} />
      <View style={styles.copy}>
        <GameText variant="label" style={{ color: colors.ornament }}>
          {eyebrow}
        </GameText>
        <GameText variant="display" style={{ fontSize: 24, lineHeight: 29 }}>
          {title}
        </GameText>
        <GameText variant="caption" style={{ color: colors.textSecondary }}>
          {subtitle}
        </GameText>
      </View>
      <GameIcon name="chevron-right" size={20} color={colors.primary} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  root: {
    minHeight: 88,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
});
