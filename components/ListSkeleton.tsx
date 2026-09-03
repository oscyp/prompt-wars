import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { BorderRadius, Spacing } from '@/constants/DesignTokens';

export interface ListSkeletonProps {
  /** How many placeholder rows to draw. */
  rows?: number;
  /** What is loading, for the screen reader ("Loading your battles"). */
  label?: string;
}

export const LIST_SKELETON_LABEL = 'Loading';
export const LIST_SKELETON_ROWS = 6;
const PULSE_HALF_MS = 700;
const PULSE_LOW = 0.55;

/**
 * Grey row blocks in the shape of a list — an avatar circle and two lines —
 * so the layout does not jump when data lands. A soft opacity pulse says
 * "loading"; static under Reduce Motion, where the busy state carries that.
 */
export default function ListSkeleton({
  rows = LIST_SKELETON_ROWS,
  label = LIST_SKELETON_LABEL,
}: ListSkeletonProps) {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(PULSE_LOW, { duration: PULSE_HALF_MS }),
        withTiming(1, { duration: PULSE_HALF_MS }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const block = { backgroundColor: colors.backgroundTertiary };
  const count = Math.max(0, Math.floor(rows));

  return (
    <Animated.View
      style={pulse}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      testID="list-skeleton"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          testID="list-skeleton-row"
          style={[
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.borderLight },
          ]}
        >
          <View style={[styles.avatar, block]} />
          <View style={styles.lines}>
            <View style={[styles.line, styles.title, block]} />
            <View style={[styles.line, styles.meta, block]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 72,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
  },
  lines: {
    flex: 1,
    gap: Spacing.sm,
  },
  line: {
    height: 12,
    borderRadius: BorderRadius.sm,
  },
  title: {
    width: '60%',
  },
  meta: {
    width: '40%',
  },
});
