import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { GAME_GLYPHS, type GameGlyph, type GameIconName } from './glyphs';
export type { GameIconName } from './glyphs';

export interface GameIconProps {
  name: GameIconName;
  size?: number;
  color?: string;
  accent?: string;
}

/** Bespoke silhouettes. The labeled parent owns interaction and accessibility. */
export function GameIcon({
  name,
  size = 24,
  color = '#C4AFFE',
  accent,
}: GameIconProps) {
  const id = `icon-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const glyph: GameGlyph = GAME_GLYPHS[name];
  return (
    <View
      testID={`game-icon-${name}`}
      accessible={false}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <Svg width={size} height={size} viewBox="0 0 64 64" accessible={false}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor={accent ?? color} />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
        </Defs>
        {glyph.body && (
          <Path
            d={glyph.body}
            fill={`url(#${id})`}
            stroke={color}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        )}
        {glyph.detail && (
          <Path
            d={glyph.detail}
            fill={accent ?? '#FFFFFF'}
            fillOpacity={0.23}
          />
        )}
        {glyph.lines && (
          <Path
            d={glyph.lines}
            fill="none"
            stroke={color}
            strokeWidth={3.1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </Svg>
    </View>
  );
}
