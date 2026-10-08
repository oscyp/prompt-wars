import React from 'react';
import {
  Text,
  TextProps,
  TextStyle,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { isLoaded } from 'expo-font';
import { GameFonts, GameType } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';

export type GameTextVariant = keyof typeof GameType;
export interface GameTextProps extends TextProps {
  variant?: GameTextVariant;
}

function plainText(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number')
        return String(child);
      if (React.isValidElement<{ children?: React.ReactNode }>(child))
        return plainText(child.props.children);
      return '';
    })
    .join('');
}

/** Barlow is used only for supported Latin text. The OS handles all other scripts. */
export function GameText({
  variant = 'body',
  children,
  style,
  ...props
}: GameTextProps) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const font = variant === 'display' ? GameFonts.display : GameFonts.label;
  const useDisplayFont =
    variant !== 'body' &&
    variant !== 'caption' &&
    /^[\u0000-\u024f\u1e00-\u1eff\u2000-\u206f]*$/u.test(plainText(children)) &&
    isLoaded(font);
  const face: TextStyle = useDisplayFont
    ? { fontFamily: font, fontWeight: 'normal', fontStyle: 'normal' }
    : {};
  const type = GameType[variant];
  const callerStyle = StyleSheet.flatten(style);
  const proportionalLineHeight =
    typeof callerStyle?.fontSize === 'number' && callerStyle.lineHeight == null
      ? { lineHeight: callerStyle.fontSize * (type.lineHeight / type.fontSize) }
      : undefined;
  return (
    <Text
      {...props}
      // Recreate only the native text node when Dynamic Type changes. The
      // current iOS binary otherwise reuses stale line metrics after resuming.
      // Editors, screen state and input nodes are not remounted.
      key={`text-scale-${fontScale}`}
      allowFontScaling
      style={[
        type,
        { color: colors.text },
        face,
        style,
        proportionalLineHeight,
      ]}
    >
      {children}
    </Text>
  );
}
