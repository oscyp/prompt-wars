import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import { GameText as Text } from '@/components/game';
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  Motion,
  NumericFontVariant,
} from '@/constants/DesignTokens';

export interface HPBarProps {
  current: number;
  max: number;
  side: 'left' | 'right';
  playerName?: string;
  /** Previous HP value, used to animate from->to. Defaults to `current`. */
  animateFrom?: number;
  compact?: boolean;
  /** Hide the visible name row (still spoken via a11y) when the surrounding
   * card already shows the player name. */
  showName?: boolean;
}

/**
 * Animated HP bar with numeric label + heart icon. Accessibility uses
 * shape (icon) + number (not color alone). Honors Reduce Motion.
 */
export default function HPBar({
  current,
  max,
  side,
  playerName,
  animateFrom,
  compact = false,
  showName = true,
}: HPBarProps) {
  const colors = useThemedColors();
  // The shared hook, not AccessibilityInfo directly: it ORs in the in-app
  // Reduce Motion toggle, which this bar used to ignore.
  const reduceMotion = useReducedMotion();
  const presentationActive = useBattlePresentationActive();
  const safeMax = Math.max(1, max);
  const clampedCurrent = Math.max(0, Math.min(current, safeMax));
  const startPct =
    animateFrom != null
      ? Math.max(0, Math.min(animateFrom, safeMax)) / safeMax
      : clampedCurrent / safeMax;
  const endPct = clampedCurrent / safeMax;

  const widthAnim = useRef(new Animated.Value(startPct)).current;
  const lostAnim = useRef(new Animated.Value(0)).current;
  const lost =
    animateFrom != null ? Math.max(0, animateFrom - clampedCurrent) : 0;

  useEffect(() => {
    if (reduceMotion || !presentationActive) {
      widthAnim.setValue(endPct);
      // The damage number still shows; it just does not fade.
      lostAnim.setValue(lost > 0 ? 1 : 0);
      return;
    }
    const spring = Animated.spring(widthAnim, {
      toValue: endPct,
      useNativeDriver: false,
      damping: Motion.spring.damping,
      stiffness: Motion.spring.stiffness,
      mass: Motion.spring.mass,
    });
    spring.start();
    let fade: Animated.CompositeAnimation | null = null;
    if (lost > 0) {
      lostAnim.setValue(1);
      fade = Animated.timing(lostAnim, {
        toValue: 0,
        duration: 1400,
        useNativeDriver: true,
      });
      fade.start();
    }
    return () => {
      spring.stop();
      fade?.stop();
    };
  }, [endPct, lost, widthAnim, lostAnim, reduceMotion, presentationActive]);

  const ratio = endPct;
  const fillColor =
    ratio > 0.5
      ? side === 'left'
        ? colors.primary
        : colors.attack
      : ratio > 0.25
        ? colors.warning
        : colors.error;

  const widthInterpolation = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const a11y = playerName
    ? `${playerName}: ${clampedCurrent} HP out of ${safeMax}${
        lost > 0 ? `, lost ${lost}` : ''
      }`
    : `${clampedCurrent} HP out of ${safeMax}${
        lost > 0 ? `, lost ${lost}` : ''
      }`;

  return (
    <View
      style={[styles.wrap, side === 'right' && styles.wrapRight]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={a11y}
      accessibilityValue={{ min: 0, max: safeMax, now: clampedCurrent }}
    >
      <View
        style={[
          styles.row,
          side === 'right' && styles.rowRight,
          compact && styles.rowCompact,
        ]}
      >
        {!compact && (
          <GameSymbol
            name="heart"
            size={compact ? 16 : 20}
            color={fillColor}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
        <View style={styles.labels}>
          {playerName && showName ? (
            <Text
              variant="fighter"
              style={[styles.name, { color: colors.text }]}
            >
              {playerName}
            </Text>
          ) : null}
          <Text
            style={[
              styles.value,
              compact && styles.valueCompact,
              NumericFontVariant,
              { color: colors.text },
              side === 'right' && { textAlign: 'right' },
            ]}
          >
            {clampedCurrent}
            <Text style={{ color: colors.textSecondary }}>/{safeMax} HP</Text>
          </Text>
        </View>
        {lost > 0 ? (
          <Animated.Text
            style={[styles.lost, { color: colors.error, opacity: lostAnim }]}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            −{lost}
          </Animated.Text>
        ) : null}
      </View>
      <View
        style={[
          styles.track,
          {
            backgroundColor: colors.backgroundTertiary,
            borderColor: colors.border,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              width: widthInterpolation,
              backgroundColor: fillColor,
              alignSelf: side === 'right' ? 'flex-end' : 'flex-start',
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  wrapRight: {
    alignItems: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  rowRight: {
    flexDirection: 'row-reverse',
  },
  rowCompact: {
    marginBottom: 2,
  },
  labels: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: Typography.weights.semibold,
  },
  value: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  valueCompact: {
    fontSize: 12,
  },
  lost: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  track: {
    // alignSelf keeps the track full-width even when `wrapRight` switches the
    // column's alignItems to flex-end (which otherwise collapses it to 0).
    alignSelf: 'stretch',
    height: 10,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
