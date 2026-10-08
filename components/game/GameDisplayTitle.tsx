import React, { useId, useState } from 'react';
import {
  Platform,
  StyleSheet,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { isLoaded } from 'expo-font';
import { GameFonts } from '@/constants/DesignTokens';
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

class TitlePaintBoundary extends React.Component<
  {
    children: React.ReactNode;
    fallback: React.ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** One native glyph layout; SVG supplies colour only, never a second text renderer. */
export function GameDisplayTitle({
  children,
  finish = 'silver',
  uppercase = true,
  style,
  onLayout,
  ...props
}: GameDisplayTitleProps) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const text = uppercase ? children.toLocaleUpperCase() : children;
  const flat = StyleSheet.flatten(style);
  const ink = finish === 'gold' ? colors.ornament : colors.text;
  const id = 'title-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const geometryKey = JSON.stringify([
    text,
    width,
    fontScale,
    flat,
    isLoaded(GameFonts.display),
  ]);
  const [box, setBox] = useState({ key: '', x: 0, y: 0, width: 0, height: 0 });
  const eligible =
    Platform.OS !== 'web' &&
    Boolean(UIManager.getViewManagerConfig?.('RNCMaskedView')) &&
    !flat?.color &&
    (!flat?.fontFamily || flat.fontFamily === GameFonts.display) &&
    isLoaded(GameFonts.display) &&
    /^[\u0000-\u024f\u1e00-\u1eff\u2000-\u206f]*$/u.test(text);
  const paint =
    eligible && box.key === geometryKey && box.width > 0 && box.height > 0;
  const textStyle = [
    {
      color: ink,
      textAlign: 'center' as const,
      letterSpacing: 0.3,
    },
    style,
  ];
  const nativeTitle = (masked: boolean) => (
    <GameText
      {...props}
      key={geometryKey}
      variant="display"
      accessibilityRole={props.accessibilityRole ?? 'header'}
      accessibilityLabel={props.accessibilityLabel ?? text}
      onLayout={(event) => {
        const next = event.nativeEvent.layout;
        setBox((old) =>
          old.key === geometryKey &&
          old.x === next.x &&
          old.y === next.y &&
          old.width === next.width &&
          old.height === next.height
            ? old
            : { key: geometryKey, ...next },
        );
        onLayout?.(event);
      }}
      // Keep the native accessibility element at alpha 1. Only its ink is masked.
      style={[
        textStyle,
        masked && { color: 'transparent', textShadowColor: 'transparent' },
      ]}
    >
      {text}
    </GameText>
  );
  return (
    <TitlePaintBoundary
      key={text + ':' + fontScale}
      fallback={nativeTitle(false)}
    >
      <View style={{ alignSelf: 'stretch', position: 'relative' }}>
        {nativeTitle(paint)}
        {paint && (
          <MaskedView
            key={`mask:${geometryKey}`}
            pointerEvents="none"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
            maskElement={
              <GameText
                {...props}
                onTextLayout={undefined}
                accessibilityRole={undefined}
                accessibilityLabel={undefined}
                variant="display"
                accessible={false}
                style={[
                  textStyle,
                  {
                    color: '#000',
                    margin: 0,
                    marginTop: 0,
                    marginBottom: 0,
                    marginLeft: 0,
                    marginRight: 0,
                    marginHorizontal: 0,
                    marginVertical: 0,
                  },
                ]}
              >
                {text}
              </GameText>
            }
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
              <Rect width="100%" height="100%" fill={'url(#' + id + ')'} />
            </Svg>
          </MaskedView>
        )}
      </View>
    </TitlePaintBoundary>
  );
}
