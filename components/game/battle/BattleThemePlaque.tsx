import React, { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  G,
  Image as SvgImage,
  LinearGradient,
  Path,
  Stop,
  Rect,
} from 'react-native-svg';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { gameBevelPath } from '@/components/game/GameBevel';
import { GamePanel, GameText } from '@/components/game';
import { environmentForTheme } from '@/constants/BattleEnvironmentArt';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Decorative art never contains the battle's authoritative theme text. */
export function BattleThemePlaque({
  theme,
  compact = false,
  framed = true,
}: {
  theme: string;
  compact?: boolean;
  /** Compose inside an owning panel without a second border. */
  framed?: boolean;
}) {
  const colors = useThemedColors();
  const scrimId = `theme-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const clipId = `${scrimId}-clip`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const Container = framed ? GamePanel : View;
  return (
    <Container
      {...(framed ? { tone: 'ornate' as const } : {})}
      style={[styles.panel, compact && styles.compact]}
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        );
      }}
    >
      {!compact && size.width > 0 && size.height > 0 && (
        <View
          pointerEvents="none"
          style={styles.art}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width={size.width} height={size.height}>
            <Defs>
              <ClipPath id={clipId}>
                {/* Stay inside the inner gold stroke, including cut corners. */}
                <Path d={gameBevelPath(size.width, size.height, 5)} />
              </ClipPath>
              <LinearGradient id={scrimId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#0B0C18" stopOpacity={0.86} />
                <Stop offset="0.58" stopColor="#0B0C18" stopOpacity={0.72} />
                <Stop offset="0.8" stopColor="#0B0C18" stopOpacity={0.2} />
                <Stop offset="1" stopColor="#0B0C18" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <G clipPath={`url(#${clipId})`}>
              <SvgImage
                href={environmentForTheme(theme).banner}
                width={size.width}
                height={size.height}
                preserveAspectRatio="xMidYMid slice"
              />
              <Rect width="100%" height="100%" fill={`url(#${scrimId})`} />
            </G>
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
    </Container>
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
  art: { ...StyleSheet.absoluteFillObject },
});
