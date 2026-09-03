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
import { HERO_MIN_HEIGHT } from './FighterHero';

export const SKELETON_LABEL = 'Loading your profile';
const PULSE_HALF_MS = 700;
const PULSE_LOW = 0.55;

/**
 * Grey blocks in the shape of the loaded screen — hero, action pills,
 * progress strip, rival rows, navigation cards — so the layout does not jump
 * when data lands. A soft opacity pulse says "loading"; static under Reduce
 * Motion, where the busy state carries that instead.
 */
export default function ProfileSkeleton() {
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

  return (
    <Animated.View
      style={pulse}
      accessible
      accessibilityLabel={SKELETON_LABEL}
      accessibilityState={{ busy: true }}
      testID="profile-skeleton"
    >
      <View style={[styles.hero, block]} />
      <View style={[styles.line, styles.meta, block]} />
      <View style={styles.pills}>
        <View style={[styles.pill, block]} />
        <View style={[styles.pill, block]} />
        <View style={[styles.pill, block]} />
      </View>
      <View style={[styles.strip, block]} />
      <View style={[styles.row, block]} />
      <View style={[styles.row, block]} />
      <View style={[styles.card, block]} />
      <View style={[styles.card, block]} />
      <View style={[styles.card, block]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: HERO_MIN_HEIGHT,
    borderRadius: BorderRadius.lg,
  },
  line: {
    height: 14,
    borderRadius: BorderRadius.sm,
  },
  meta: {
    width: '55%',
    marginTop: Spacing.sm,
  },
  pills: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.full,
  },
  strip: {
    height: 220,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  row: {
    height: 52,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  card: {
    height: 64,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
});
