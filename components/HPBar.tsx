import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius, Motion, NumericFontVariant } from '@/constants/DesignTokens';

export interface HPBarProps {
  current: number;
  max: number;
  side: 'left' | 'right';
  playerName?: string;
  /** Previous HP value, used to animate from->to. Defaults to `current`. */
  animateFrom?: number;
  compact?: boolean;
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
}: HPBarProps) {
  const colors = useThemedColors();
  const safeMax = Math.max(1, max);
  const clampedCurrent = Math.max(0, Math.min(current, safeMax));
  const startPct = animateFrom != null
    ? Math.max(0, Math.min(animateFrom, safeMax)) / safeMax
    : clampedCurrent / safeMax;
  const endPct = clampedCurrent / safeMax;

  const widthAnim = useRef(new Animated.Value(startPct)).current;
  const lostAnim = useRef(new Animated.Value(0)).current;
  const lost = animateFrom != null
    ? Math.max(0, animateFrom - clampedCurrent)
    : 0;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          widthAnim.setValue(endPct);
          return;
        }
        Animated.spring(widthAnim, {
          toValue: endPct,
          useNativeDriver: false,
          damping: Motion.spring.damping,
          stiffness: Motion.spring.stiffness,
          mass: Motion.spring.mass,
        }).start();
        if (lost > 0) {
          lostAnim.setValue(1);
          Animated.timing(lostAnim, {
            toValue: 0,
            duration: 1400,
            useNativeDriver: true,
          }).start();
        }
      })
      .catch(() => {
        widthAnim.setValue(endPct);
      });
    return () => {
      cancelled = true;
    };
  }, [endPct, lost, widthAnim, lostAnim]);

  const ratio = endPct;
  const fillColor =
    ratio > 0.5
      ? colors.success
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
        <Ionicons
          name="heart"
          size={compact ? 16 : 20}
          color={fillColor}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={styles.labels}>
          {playerName ? (
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={1}
            >
              {playerName}
            </Text>
          ) : null}
          <Text style={[styles.value, NumericFontVariant, { color: colors.text }]}>
            {clampedCurrent}
            <Text style={{ color: colors.textSecondary }}> / {safeMax} HP</Text>
          </Text>
        </View>
        {lost > 0 ? (
          <Animated.Text
            style={[
              styles.lost,
              { color: colors.error, opacity: lostAnim },
            ]}
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
          { backgroundColor: colors.backgroundTertiary, borderColor: colors.border },
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
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  value: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  lost: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  track: {
    height: 10,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});
