import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Line, Defs, RadialGradient as SvgRadialGradient, Stop, Rect } from 'react-native-svg';
import { useThemedColors } from '@/hooks/useThemedColors';

interface NeonGridBackgroundProps {
  /** Whether to animate the slow grid drift. Defaults to true. */
  animated?: boolean;
  /** Gradient stops for the underlying glow. */
  glowColors?: readonly [string, string, string];
}

/**
 * Animated neon grid backdrop with a soft radial glow.
 * Pure SVG + Reanimated — no Skia required.
 */
export default function NeonGridBackground({
  animated = true,
  glowColors,
}: NeonGridBackgroundProps) {
  const colors = useThemedColors();
  const { width, height } = useWindowDimensions();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (animated) {
      drift.value = withRepeat(
        withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      drift.value = 0;
    }
  }, [animated, drift]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -16 + drift.value * 32 }],
    opacity: 0.55 + drift.value * 0.2,
  }));

  const gridSpacing = 36;
  const cols = Math.ceil(width / gridSpacing) + 2;
  const rows = Math.ceil((height + 64) / gridSpacing) + 2;
  const gridColor = colors.glowPrimary;

  const stops: readonly [string, string, string] =
    glowColors ?? [`${colors.primary}77`, `${colors.background}00`, `${colors.background}00`];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[colors.surface0, colors.background, colors.surface1] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <Svg width={width} height={height + 64} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgRadialGradient id="glow" cx="50%" cy="40%" rx="60%" ry="60%">
              <Stop offset="0%" stopColor={stops[0]} />
              <Stop offset="60%" stopColor={stops[1]} />
              <Stop offset="100%" stopColor={stops[2]} />
            </SvgRadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height + 64} fill="url(#glow)" />
          {Array.from({ length: cols }).map((_, i) => (
            <Line
              key={`v${i}`}
              x1={i * gridSpacing}
              y1={0}
              x2={i * gridSpacing}
              y2={height + 64}
              stroke={gridColor}
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: rows }).map((_, i) => (
            <Line
              key={`h${i}`}
              x1={0}
              y1={i * gridSpacing}
              x2={width}
              y2={i * gridSpacing}
              stroke={gridColor}
              strokeOpacity={0.08}
              strokeWidth={1}
            />
          ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
