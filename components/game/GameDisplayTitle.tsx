import React, { useId, useState } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type TextLayoutLine,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { isLoaded } from 'expo-font';
import { GameFonts, GameType } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameText, type GameTextProps } from './GameText';

export interface GameDisplayTitleProps extends Omit<
  GameTextProps,
  'children' | 'variant'
> {
  children: string;
  finish?: 'silver' | 'gold';
  uppercase?: boolean;
}

/** Native text owns wrapping and accessibility; ornamental paint never hides it. */
export function GameDisplayTitle({
  children,
  finish = 'silver',
  uppercase = true,
  style,
  onTextLayout,
  onLayout,
  ...props
}: GameDisplayTitleProps) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const text = uppercase ? children.toLocaleUpperCase() : children;
  const flat = StyleSheet.flatten(style);
  const fontSize = flat?.fontSize ?? GameType.display.fontSize;
  const paintKey = `${text}:${fontScale}:${fontSize}:${flat?.letterSpacing ?? 0}`;
  const [layout, setLayout] = useState<{
    key: string;
    lines: TextLayoutLine[];
  }>({ key: '', lines: [] });
  const [origin, setOrigin] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const id = `title-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ink = finish === 'gold' ? colors.ornament : colors.text;
  const paint =
    !flat?.color &&
    (!flat?.fontFamily || flat.fontFamily === GameFonts.display) &&
    origin.width > 0 &&
    layout.key === paintKey &&
    isLoaded(GameFonts.display) &&
    /^[\u0000-\u024f\u1e00-\u1eff\u2000-\u206f]*$/u.test(text);
  return (
    <View style={{ alignSelf: 'stretch', position: 'relative' }}>
      <GameText
        {...props}
        variant="display"
        accessibilityRole={props.accessibilityRole ?? 'header'}
        accessibilityLabel={props.accessibilityLabel ?? text}
        onLayout={(event) => {
          const next = event.nativeEvent.layout;
          setOrigin((old) =>
            old.x === next.x &&
            old.y === next.y &&
            old.width === next.width &&
            old.height === next.height
              ? old
              : next,
          );
          onLayout?.(event);
        }}
        onTextLayout={(event) => {
          const lines = event.nativeEvent.lines;
          setLayout((old) =>
            old.key === paintKey &&
            JSON.stringify(old.lines) === JSON.stringify(lines)
              ? old
              : { key: paintKey, lines },
          );
          onTextLayout?.(event);
        }}
        style={[{ color: ink, textAlign: 'center', letterSpacing: 0.3 }, style]}
      >
        {text}
      </GameText>
      {paint && (
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            left: origin.x,
            top: origin.y,
            width: origin.width,
            height: origin.height,
          }}
        >
          <Svg width="100%" height="100%" accessible={false}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop
                  offset="0"
                  stopColor={finish === 'gold' ? '#FFF2CA' : '#FCFAFF'}
                />
                <Stop
                  offset="0.5"
                  stopColor={finish === 'gold' ? '#F4D391' : '#EEE7FF'}
                />
                <Stop
                  offset="1"
                  stopColor={finish === 'gold' ? '#BC8541' : '#A99AD6'}
                />
              </LinearGradient>
            </Defs>
            {layout.lines.map((line, index) => (
              <SvgText
                key={index}
                x={line.x}
                y={line.y + line.ascender}
                fontFamily={GameFonts.display}
                fontSize={fontSize * fontScale}
                letterSpacing={(flat?.letterSpacing ?? 0.3) * fontScale}
                fill={`url(#${id})`}
                stroke={ink}
                strokeWidth={0.2}
              >
                {line.text}
              </SvgText>
            ))}
          </Svg>
        </View>
      )}
    </View>
  );
}
