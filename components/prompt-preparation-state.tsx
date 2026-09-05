import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  BorderRadius,
  Layout,
  Motion,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';

export const PROMPT_PREPARATION_GRACE_MS = 350;
export const PROMPT_PREPARATION_SLOW_MS = 5000;

export interface PromptPreparationStateProps {
  fighterName: string;
  moveType: MoveType;
  generating: boolean;
  onWriteOwn: () => void;
}

/**
 * A short, themed anticipation state for the first suggestion set.
 *
 * Fast indexed reads never flash a loader. A real generation call appears
 * immediately because it is expected to take a few seconds, then changes its
 * copy after five seconds without inventing a percentage. Writing remains
 * available throughout, so suggestions never block the player's turn.
 */
export default function PromptPreparationState({
  fighterName,
  moveType,
  generating,
  onWriteOwn,
}: PromptPreparationStateProps) {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(generating);
  const [slow, setSlow] = useState(false);
  const pulseValue = useSharedValue(1);

  useEffect(() => {
    if (generating) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(
      () => setVisible(true),
      PROMPT_PREPARATION_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [generating]);

  useEffect(() => {
    setSlow(false);
    if (!generating) return;
    const timer = setTimeout(() => setSlow(true), PROMPT_PREPARATION_SLOW_MS);
    return () => clearTimeout(timer);
  }, [generating]);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulseValue);
      pulseValue.value = 1;
      return;
    }
    pulseValue.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 650 }),
        withTiming(1, { duration: 650 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulseValue);
  }, [pulseValue, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseValue.value,
  }));

  if (!visible) {
    return <View testID="prompt-preparation-grace" />;
  }

  const statusLabel = generating
    ? `Preparing three prompt ideas for ${fighterName}'s ${moveLabel(moveType)} move`
    : 'Loading prompt ideas already prepared for this move';

  return (
    <Animated.View
      entering={
        reduceMotion ? undefined : FadeIn.duration(Motion.durations.base)
      }
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID="prompt-preparation"
    >
      <View
        style={styles.status}
        accessible
        accessibilityLabel={statusLabel}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy: true }}
      >
        <View
          style={[styles.icon, { backgroundColor: colors.backgroundTertiary }]}
        >
          <Ionicons name="sparkles" size={24} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>
          {generating ? 'Preparing your ideas' : 'Loading your ideas'}
        </Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>
          {generating
            ? `Tailoring three prompts to ${fighterName}, your ${moveLabel(moveType).toLowerCase()} move, and this battle’s theme.`
            : 'Checking for ideas already prepared for this move.'}
        </Text>
        <Text
          style={[
            styles.waitHint,
            { color: slow ? colors.warning : colors.textTertiary },
          ]}
          accessibilityLiveRegion={slow ? 'polite' : 'none'}
        >
          {slow
            ? 'Still working — personalized ideas can take a little longer.'
            : 'Usually ready in a few seconds.'}
        </Text>
      </View>

      <Animated.View
        style={[styles.ideaPreview, pulseStyle]}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
      >
        {[0, 1, 2].map((index) => (
          <View
            key={index}
            style={[
              styles.ideaLine,
              { backgroundColor: colors.backgroundTertiary },
            ]}
            testID="prompt-preparation-line"
          />
        ))}
      </Animated.View>

      <TouchableOpacity
        style={[styles.writeButton, { borderColor: colors.border }]}
        onPress={onWriteOwn}
        accessibilityLabel="Write your own prompt now"
        accessibilityHint="Starts the prompt editor while ideas continue preparing"
        accessibilityRole="button"
      >
        <Ionicons name="create-outline" size={17} color={colors.primary} />
        <Text style={[styles.writeButtonText, { color: colors.primary }]}>
          Write your own now
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  status: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  detail: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  waitHint: {
    minHeight: 18,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
  },
  ideaPreview: {
    gap: Spacing.sm,
  },
  ideaLine: {
    height: 10,
    borderRadius: BorderRadius.full,
  },
  writeButton: {
    minHeight: Layout.inputHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  writeButtonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
