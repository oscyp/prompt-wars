import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Motion, NumericFontVariant } from '@/constants/DesignTokens';

export interface AnimatedCounterProps {
  /** Target value to count up to. */
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: StyleProp<TextStyle>;
  /** Overrides the auto-generated a11y label (which always states the final value). */
  accessibilityLabel?: string;
}

/**
 * Counts a number up to `value` using Reanimated. Renders with tabular
 * (fixed-width) figures so digits never jitter mid-count.
 *
 * Honors Reduce Motion: when enabled, the final value is shown instantly with
 * no animation. Accessibility always reports the final value, never the
 * in-between frames.
 */
export default function AnimatedCounter({
  value,
  duration = Motion.durations.count,
  prefix = '',
  suffix = '',
  style,
  accessibilityLabel,
}: AnimatedCounterProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<number>(reduceMotion ? value : 0);
  const progress = useSharedValue<number>(reduceMotion ? value : 0);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = value;
      setDisplay(value);
      return;
    }

    // Animate up from 0 on first appearance; snap for later value changes.
    if (hasAnimated.current) {
      progress.value = value;
      setDisplay(value);
      return;
    }
    hasAnimated.current = true;
    progress.value = 0;
    progress.value = withTiming(value, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, duration, reduceMotion, progress]);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(setDisplay)(Math.round(current));
    },
    [],
  );

  return (
    <Text
      style={[NumericFontVariant, style]}
      accessibilityLabel={accessibilityLabel ?? `${prefix}${value}${suffix}`}
    >
      {prefix}
      {display}
      {suffix}
    </Text>
  );
}
