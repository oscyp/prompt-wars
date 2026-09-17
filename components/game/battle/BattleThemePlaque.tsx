import React, { useId } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { GamePanel, GameText } from '@/components/game';
import { presentationForTheme } from '@/constants/ThemeArt';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Decorative art never contains the battle's authoritative theme text. */
export function BattleThemePlaque({
  theme,
  compact = false,
}: {
  theme: string;
  compact?: boolean;
}) {
  const colors = useThemedColors();
  const scrimId = `theme-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <GamePanel tone="ornate" style={[styles.panel, compact && styles.compact]}>
      {!compact && (
        <View
          pointerEvents="none"
          style={styles.art}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Image
            source={presentationForTheme(theme).backdrop}
            style={styles.illustration}
            resizeMode="cover"
          />
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={scrimId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#0B0C18" stopOpacity={0.97} />
                <Stop offset="0.66" stopColor="#0B0C18" stopOpacity={0.94} />
                <Stop offset="0.8" stopColor="#0B0C18" stopOpacity={0.15} />
                <Stop offset="1" stopColor="#0B0C18" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${scrimId})`} />
          </Svg>
        </View>
      )}
      <GameText
        variant="label"
        style={{ color: colors.textSecondary, fontSize: 14 }}
      >
        THEME
      </GameText>
      <View style={compact ? styles.compactTitle : styles.illustratedTitle}>
        <GameDisplayTitle
          finish="gold"
          uppercase={false}
          accessibilityRole="header"
          style={{
            textAlign: 'left',
            fontSize: compact ? 20 : 28,
            lineHeight: compact ? 26 : 34,
          }}
        >
          {theme}
        </GameDisplayTitle>
      </View>
    </GamePanel>
  );
}
const styles = StyleSheet.create({
  panel: { gap: 6, paddingVertical: 16, minHeight: 132 },
  compact: {
    paddingVertical: 8,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactTitle: { flex: 1, minWidth: 0 },
  illustratedTitle: { width: '64%', minWidth: 0 },
  illustration: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '52%',
  },
  art: { ...StyleSheet.absoluteFillObject, margin: 3, overflow: 'hidden' },
});
