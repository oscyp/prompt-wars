import React, { useId, useState } from 'react';
import {
  View,
  StyleSheet,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import { Gradients } from '@/constants/DesignTokens';

export interface PosterGradientProps {
  /** Signature / winner colour the gradient fades from. */
  base: string;
  /** Defaults to filling the parent. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The cinematic vertical gradient from `Gradients.poster`, as a component.
 *
 * `react-native-svg` needs pixel dimensions, so this measures itself and draws
 * nothing until it has them. The gradient id is unique per instance: the
 * original inline version hardcoded `posterGrad`, and two posters on one screen
 * would have shared a `<Defs>` entry.
 */
export default function PosterGradient({
  base,
  style,
  testID,
}: PosterGradientProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  // React ids contain colons, which some SVG parsers reject inside url(#…).
  const gradientId = `posterGrad-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const stops = Gradients.poster(base);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, style]}
      onLayout={onLayout}
      pointerEvents="none"
      testID={testID}
    >
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {stops.map((s, i) => (
                <Stop
                  key={i}
                  offset={s.offset}
                  stopColor={s.color}
                  stopOpacity={s.opacity}
                />
              ))}
            </SvgLinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}
