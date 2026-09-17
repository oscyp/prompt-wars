import React, { useState, useId } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { GameChrome } from '@/constants/DesignTokens';

export interface GameBevelProps {
  color: string;
  fill?: string;
  insetColor?: string;
  strokeWidth?: number;
  cut?: number;
  gradient?: readonly [string, string];
}

/** Decoration only. Pixel-space geometry keeps corner cuts stable on tall panels. */
export function GameBevel({
  color,
  fill = 'transparent',
  insetColor,
  strokeWidth = 1,
  cut = GameChrome.cut,
  gradient,
}: GameBevelProps) {
  const gradientId = `bevel-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setSize((old) =>
      old.width === layout.width && old.height === layout.height
        ? old
        : { width: layout.width, height: layout.height },
    );
  };
  const path = (inset: number) => {
    const x = inset,
      y = inset,
      right = size.width - inset,
      bottom = size.height - inset;
    const c = Math.max(0, Math.min(cut, (right - x) / 2, (bottom - y) / 2));
    return `M ${x + c} ${y} H ${right - c} L ${right} ${y + c} V ${bottom - c} L ${right - c} ${bottom} H ${x + c} L ${x} ${bottom - c} V ${y + c} Z`;
  };
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={StyleSheet.absoluteFill}
    >
      {size.width > 0 && size.height > 0 && (
        <Svg width={size.width} height={size.height} accessible={false}>
          {gradient && (
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={gradient[0]} />
                <Stop offset="1" stopColor={gradient[1]} />
              </LinearGradient>
            </Defs>
          )}
          <Path
            d={path(strokeWidth / 2)}
            fill={gradient ? `url(#${gradientId})` : fill}
            stroke={color}
            strokeWidth={strokeWidth}
          />
          {insetColor && (
            <Path
              d={path(3.5)}
              fill="none"
              stroke={insetColor}
              strokeWidth={0.75}
            />
          )}
        </Svg>
      )}
    </View>
  );
}
