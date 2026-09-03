import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  BorderRadius,
  Ink,
  Scrim,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import { moveLabel } from '@/utils/battleCopy';
import type { StingPreset } from '@/utils/revealBeats';
import { STING_DURATION_MS, STING_LANDING_MS } from '@/utils/revealLayout';

export interface MoveStingProps {
  /** Which canned overlay plays; null renders nothing. */
  preset: StingPreset | null;
  /** The winner's colour: the streak's glow, the ring, the impact frame. */
  color: string;
  /** Fires at the sting's impact moment (immediately under Reduce Motion). */
  onLanded?: () => void;
  /** Delay before the sting starts, so it lands after the poster settles. */
  delayMs?: number;
}

/**
 * The per-move canned animation overlay from concept §8.1, drawn from tokens
 * with no assets: attack is a diagonal light streak, defense an expanding
 * ring, finisher a white flash with a three-step shake. Under Reduce Motion
 * the same information is a static badge in the corner and `onLanded` fires
 * at once. Never intercepts touches; never speaks to a screen reader except
 * as the badge.
 */
export default function MoveSting({
  preset,
  color,
  onLanded,
  delayMs = 0,
}: MoveStingProps) {
  const reduceMotion = useReducedMotion();
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  useEffect(() => {
    if (!preset) return;
    if (reduceMotion) {
      onLandedRef.current?.();
      return;
    }
    const timer = setTimeout(
      () => onLandedRef.current?.(),
      delayMs + STING_LANDING_MS[preset],
    );
    return () => clearTimeout(timer);
  }, [preset, reduceMotion, delayMs]);

  if (!preset) return null;

  if (reduceMotion) {
    const label = moveLabel(preset);
    return (
      <View style={styles.layer} pointerEvents="none">
        <View
          style={styles.badge}
          accessible
          accessibilityLabel={`${label} move`}
          testID="move-sting-badge"
        >
          <Ionicons
            name={MOVE_META[preset].icon}
            size={16}
            color={Ink.onAccentLight}
          />
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={styles.layer}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
      testID={`move-sting-${preset}`}
    >
      {preset === 'attack' ? (
        <AttackStreak color={color} delayMs={delayMs} />
      ) : preset === 'defense' ? (
        <DefenseRing color={color} delayMs={delayMs} />
      ) : (
        <FinisherFlash color={color} delayMs={delayMs} />
      )}
    </View>
  );
}

interface VariantProps {
  color: string;
  delayMs: number;
}

/** A thin bright bar with a coloured glow, sweeping corner to corner. */
function AttackStreak({ color, delayMs }: VariantProps) {
  const { width, height } = useWindowDimensions();
  const travel = (width + height) / 2;
  const x = useSharedValue(-travel);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const sweep = STING_DURATION_MS * 0.8;
    x.value = -travel;
    x.value = withDelay(
      delayMs,
      withTiming(travel, {
        duration: sweep,
        easing: Easing.inOut(Easing.cubic),
      }),
    );
    opacity.value = 0;
    opacity.value = withDelay(
      delayMs,
      withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(1, { duration: sweep - 240 }),
        withTiming(0, { duration: 120 }),
      ),
    );
  }, [delayMs, travel, x, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { rotate: '-24deg' }],
  }));

  return (
    <Animated.View style={[styles.streak, style]}>
      <View style={[styles.streakGlow, { backgroundColor: color }]} />
      <View style={styles.streakCore} />
    </Animated.View>
  );
}

/** Two rings expanding from the centre, the second a beat behind. */
function DefenseRing({ color, delayMs }: VariantProps) {
  return (
    <View style={styles.centered}>
      <Ring color={color} delayMs={delayMs} toScale={3} />
      <Ring color={color} delayMs={delayMs + 140} toScale={2.2} />
    </View>
  );
}

function Ring({ color, delayMs, toScale }: VariantProps & { toScale: number }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = 0.3;
    scale.value = withDelay(
      delayMs,
      withTiming(toScale, {
        duration: STING_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
    opacity.value = 0;
    opacity.value = withDelay(
      delayMs,
      withSequence(
        withTiming(0.9, { duration: 100 }),
        withTiming(0, { duration: STING_DURATION_MS - 100 }),
      ),
    );
  }, [delayMs, toScale, scale, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.ring, { borderColor: color }, style]} />;
}

/**
 * A white flash and a thick impact frame in the winner's colour, both jolted
 * side to side three times. The shake is on the sting layer itself, so the
 * poster underneath stays still and nothing else has to know about it.
 */
function FinisherFlash({ color, delayMs }: VariantProps) {
  const flash = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    flash.value = 0;
    flash.value = withDelay(
      delayMs,
      withSequence(
        withTiming(0.6, { duration: 80 }),
        withTiming(0, { duration: 420 }),
      ),
    );
    shake.value = 0;
    shake.value = withDelay(
      delayMs + 60,
      withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(-6, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      ),
    );
  }, [delayMs, flash, shake]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, flashStyle]}>
        <View style={[StyleSheet.absoluteFill, styles.flash]} />
        <View style={[styles.impactFrame, { borderColor: color }]} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Scrim.pill,
  },
  badgeText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.3,
  },
  streak: {
    position: 'absolute',
    top: '-30%',
    left: '50%',
    width: 32,
    height: '160%',
    marginLeft: -16,
    alignItems: 'center',
  },
  streakGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    borderRadius: BorderRadius.full,
  },
  streakCore: {
    width: 2,
    height: '100%',
    backgroundColor: Ink.onAccentLight,
  },
  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
  },
  flash: {
    backgroundColor: Ink.onAccentLight,
  },
  impactFrame: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 8,
  },
});
