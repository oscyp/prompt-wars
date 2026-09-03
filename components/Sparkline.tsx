import React, { useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';

export interface SparklineProps {
  /** Oldest to newest. */
  points: readonly number[];
  /** The whole chart is one image node; this is what it says. */
  accessibilityLabel: string;
  /** Shown instead of the chart when there are fewer than two points. */
  emptyText: string;
  height?: number;
  /** Defaults to the theme's primary. */
  color?: string;
  testID?: string;
}

export const SPARKLINE_HEIGHT = 56;
const DOT_RADIUS = 3;
const STROKE_WIDTH = 2;
/** Keeps the end dots and the stroke inside the box. */
const PAD = DOT_RADIUS + STROKE_WIDTH;

export interface SparklinePoint {
  x: number;
  y: number;
}

/**
 * Pixel positions for `points` inside a `width` × `height` box: evenly spaced
 * on x, scaled between min and max on y. A flat series draws mid-height.
 * Empty before the box has been measured or with fewer than two points.
 */
export function sparklinePath(
  points: readonly number[],
  width: number,
  height: number,
  pad: number = PAD,
): SparklinePoint[] {
  if (points.length < 2 || width <= 0 || height <= 0) return [];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  const innerW = Math.max(0, width - pad * 2);
  const innerH = Math.max(0, height - pad * 2);
  return points.map((p, i) => ({
    x: pad + (innerW * i) / (points.length - 1),
    y:
      span === 0
        ? pad + innerH / 2
        : pad + innerH - ((p - min) / span) * innerH,
  }));
}

/**
 * A small line chart with a dot per point and the first and last values
 * labelled. Static: nothing animates, so there is nothing to gate on Reduce
 * Motion. Measures itself, like `PosterGradient`, because `react-native-svg`
 * needs pixel dimensions.
 */
export default function Sparkline({
  points,
  accessibilityLabel,
  emptyText,
  height = SPARKLINE_HEIGHT,
  color,
  testID,
}: SparklineProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <Text
        style={[styles.empty, accessibleText, { color: colors.textSecondary }]}
        testID={testID}
      >
        {emptyText}
      </Text>
    );
  }

  const stroke = color ?? colors.primary;
  const coords = sparklinePath(points, width, height);
  const first = Math.round(points[0]);
  const last = Math.round(points[points.length - 1]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={{ height }} onLayout={onLayout}>
        {coords.length > 0 ? (
          <Svg width={width} height={height}>
            <Polyline
              points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={STROKE_WIDTH}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {coords.map((c, i) => (
              <Circle key={i} cx={c.x} cy={c.y} r={DOT_RADIUS} fill={stroke} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        <Text
          style={[
            styles.label,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {first}
        </Text>
        <Text
          style={[styles.label, NumericFontVariant, { color: colors.text }]}
        >
          {last}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: Spacing.sm,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  label: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  empty: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
});
