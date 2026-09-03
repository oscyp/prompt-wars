import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Motion,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import {
  hapticDefeat,
  hapticDraw,
  hapticSelection,
  hapticVictory,
} from '@/utils/haptics';
import type { BattleFormat } from '@/types/battle';
import { verdictCopy, type RevealOutcome } from '@/utils/revealBeats';
import { verdictTimeline, type RevealInsets } from '@/utils/revealLayout';

export interface RevealVerdictBeatProps {
  format: BattleFormat;
  outcome: RevealOutcome;
  /** Rounds won, from the viewer's side. Ignored on single format. */
  mine: number;
  theirs: number;
  isKo: boolean;
  reduceMotion: boolean;
  insets: RevealInsets;
}

/**
 * Beat one: the score dots land one by one, the headline springs in, and a
 * knockout slams its stamp. The outcome haptic fires once, when the stamp (or
 * the headline, without one) lands; under Reduce Motion everything is at rest
 * and the haptic fires on mount.
 */
export default function RevealVerdictBeat({
  format,
  outcome,
  mine,
  theirs,
  isKo,
  reduceMotion,
  insets,
}: RevealVerdictBeatProps) {
  const colors = useThemedColors();
  const copy = verdictCopy({ format, outcome, mine, theirs, isKo });
  const outcomeColor =
    outcome === 'draw'
      ? colors.warning
      : outcome === 'won'
        ? colors.success
        : colors.error;

  const showScore = format === 'bo3';
  const safeMine = Math.max(0, mine);
  const safeTheirs = Math.max(0, theirs);
  const dots = showScore ? safeMine + safeTheirs : 0;
  const hasStamp = copy.stamp !== null;

  const timeline = useMemo(
    () => verdictTimeline({ dots, hasStamp, reduceMotion }),
    [dots, hasStamp, reduceMotion],
  );

  // Haptics follow the same clock as the visuals. One outcome haptic only.
  const outcomeFired = useRef(false);
  useEffect(() => {
    const fireOutcome = () => {
      if (outcomeFired.current) return;
      outcomeFired.current = true;
      if (outcome === 'draw') hapticDraw();
      else if (outcome === 'won') hapticVictory();
      else hapticDefeat();
    };
    if (reduceMotion) {
      fireOutcome();
      return;
    }
    const timers = timeline.dotDelays.map((delay) =>
      setTimeout(hapticSelection, delay),
    );
    timers.push(setTimeout(fireOutcome, timeline.outcomeAt));
    return () => timers.forEach(clearTimeout);
  }, [timeline, reduceMotion, outcome]);

  // Headline: scale 0.8 → 1 on a spring, fading in.
  const headlineScale = useSharedValue(reduceMotion ? 1 : 0.8);
  const headlineOpacity = useSharedValue(reduceMotion ? 1 : 0);
  // Stamp: slams down from 1.5 → 1.
  const stampScale = useSharedValue(reduceMotion ? 1 : 1.5);
  const stampOpacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      headlineScale.value = 1;
      headlineOpacity.value = 1;
      stampScale.value = 1;
      stampOpacity.value = 1;
      return;
    }
    headlineScale.value = withDelay(
      timeline.headlineAt,
      withSpring(1, Motion.spring),
    );
    headlineOpacity.value = withDelay(
      timeline.headlineAt,
      withTiming(1, { duration: Motion.durations.base }),
    );
    if (timeline.stampAt !== null) {
      stampScale.value = withDelay(
        timeline.stampAt,
        withSpring(1, Motion.spring),
      );
      stampOpacity.value = withDelay(
        timeline.stampAt,
        withTiming(1, { duration: Motion.durations.fast }),
      );
    }
  }, [
    reduceMotion,
    timeline,
    headlineScale,
    headlineOpacity,
    stampScale,
    stampOpacity,
  ]);

  const headlineStyle = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ scale: headlineScale.value }],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity.value,
    transform: [{ rotate: '-6deg' }, { scale: stampScale.value }],
  }));

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {showScore ? (
        <View style={styles.scoreRow}>
          <ScoreColumn
            value={safeMine}
            who="You"
            dotDelays={timeline.dotDelays.slice(0, safeMine)}
            reduceMotion={reduceMotion}
            color={colors.text}
            secondary={colors.textSecondary}
          />
          <Text
            style={[
              styles.dash,
              NumericFontVariant,
              { color: colors.textTertiary },
            ]}
          >
            –
          </Text>
          <ScoreColumn
            value={safeTheirs}
            who="Opponent"
            dotDelays={timeline.dotDelays.slice(safeMine)}
            reduceMotion={reduceMotion}
            color={colors.text}
            secondary={colors.textSecondary}
          />
        </View>
      ) : null}

      <Animated.View style={headlineStyle}>
        <Text
          style={[
            showScore ? styles.headlineSeries : styles.headlineSingle,
            NumericFontVariant,
            { color: outcomeColor },
          ]}
        >
          {copy.headline}
        </Text>
      </Animated.View>

      {copy.stamp ? (
        <Animated.View
          style={[styles.stamp, { borderColor: outcomeColor }, stampStyle]}
        >
          <Text style={[styles.stampText, { color: outcomeColor }]}>
            {copy.stamp}
          </Text>
        </Animated.View>
      ) : null}

      {copy.subline ? (
        <Text style={[styles.subline, { color: colors.textSecondary }]}>
          {copy.subline}
        </Text>
      ) : null}
    </View>
  );
}

function ScoreColumn({
  value,
  who,
  dotDelays,
  reduceMotion,
  color,
  secondary,
}: {
  value: number;
  who: string;
  dotDelays: number[];
  reduceMotion: boolean;
  color: string;
  secondary: string;
}) {
  return (
    <View style={styles.scoreCol}>
      <Text style={[styles.score, NumericFontVariant, { color }]}>{value}</Text>
      <Text style={[styles.who, { color: secondary }]}>{who}</Text>
      <View style={styles.dots}>
        {dotDelays.map((delay, i) => (
          <Dot
            key={i}
            delay={delay}
            reduceMotion={reduceMotion}
            color={color}
          />
        ))}
      </View>
    </View>
  );
}

function Dot({
  delay,
  reduceMotion,
  color,
}: {
  delay: number;
  reduceMotion: boolean;
  color: string;
}) {
  const scale = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withDelay(delay, withSpring(1, Motion.spring));
  }, [delay, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color }, style]}
      testID="verdict-dot"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  scoreCol: {
    alignItems: 'center',
    minWidth: 72,
    gap: Spacing.xs,
  },
  score: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    lineHeight: Typography.sizes.hero * 1.1,
  },
  dash: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    lineHeight: Typography.sizes.hero * 1.1,
  },
  who: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    minHeight: 14,
    marginTop: Spacing.xs,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  headlineSeries: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  headlineSingle: {
    fontSize: Typography.sizes.display,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  stamp: {
    borderWidth: 4,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  stampText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
  },
  subline: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
});
