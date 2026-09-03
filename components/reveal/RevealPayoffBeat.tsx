import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Motion,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import AnimatedCounter from '@/components/AnimatedCounter';
import { hapticSuccess } from '@/utils/haptics';
import { REWARDS_PENDING_LINE, type PayoffRow } from '@/utils/revealBeats';
import type { RevealInsets } from '@/utils/revealLayout';

export interface RevealPayoffBeatProps {
  rows: PayoffRow[];
  /** From `payoffFallbackLine`; shown when there are no rows. */
  fallbackLine: string | null;
  /** True while the battle is not yet `completed` and no reward has landed. */
  pending: boolean;
  reduceMotion: boolean;
  insets: RevealInsets;
}

export const PAYOFF_BEAT_TITLE = 'Your rewards';

/** What a screen reader hears for one row. */
export function payoffRowLabel(row: PayoffRow): string {
  return `${row.label}: ${row.value}${row.detail ? `. ${row.detail}` : ''}`;
}

/**
 * Beat four: one row per payoff, entering staggered, numbers counting up.
 * Tone is carried by colour *and* a glyph. Re-renders when the reward payload
 * arrives over Realtime, so a pending line simply becomes rows.
 */
export default function RevealPayoffBeat({
  rows,
  fallbackLine,
  pending,
  reduceMotion,
  insets,
}: RevealPayoffBeatProps) {
  const colors = useThemedColors();

  // One success haptic, the first time a credits or streak gain is on screen.
  const celebrated = useRef(false);
  const hasGain = rows.some(
    (r) => (r.key === 'credits' || r.key === 'streak') && r.tone === 'up',
  );
  useEffect(() => {
    if (!hasGain || celebrated.current) return;
    celebrated.current = true;
    hapticSuccess();
  }, [hasGain]);

  const toneColor = (tone: PayoffRow['tone']) =>
    tone === 'up'
      ? colors.success
      : tone === 'down'
        ? colors.error
        : colors.text;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={[styles.title, { color: colors.text }]}
        accessibilityRole="header"
      >
        {PAYOFF_BEAT_TITLE}
      </Text>

      {rows.map((row, i) => (
        <Animated.View
          key={row.key}
          style={[
            styles.row,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          entering={
            reduceMotion
              ? undefined
              : FadeInDown.duration(Motion.durations.base).delay(i * 80)
          }
          accessible
          accessibilityLabel={payoffRowLabel(row)}
        >
          <View style={styles.rowText}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {row.label}
            </Text>
            {row.detail ? (
              <Text style={[styles.detail, { color: colors.textTertiary }]}>
                {row.detail}
              </Text>
            ) : null}
          </View>
          <View style={styles.valueRow}>
            {row.tone !== 'neutral' ? (
              <Ionicons
                name={row.tone === 'up' ? 'trending-up' : 'trending-down'}
                size={18}
                color={toneColor(row.tone)}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            ) : null}
            {row.counter ? (
              <AnimatedCounter
                value={row.counter.to}
                prefix={row.counter.prefix}
                suffix={row.counter.suffix}
                style={[styles.value, { color: toneColor(row.tone) }]}
                accessibilityLabel={row.value}
              />
            ) : (
              <Text
                style={[
                  styles.value,
                  NumericFontVariant,
                  { color: toneColor(row.tone) },
                ]}
              >
                {row.value}
              </Text>
            )}
          </View>
        </Animated.View>
      ))}

      {rows.length === 0 && fallbackLine ? (
        <View style={styles.fallbackRow} accessibilityLiveRegion="polite">
          {pending ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : null}
          <Text style={[styles.fallback, { color: colors.textSecondary }]}>
            {fallbackLine}
          </Text>
        </View>
      ) : rows.length > 0 && pending ? (
        <View style={styles.fallbackRow} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={[styles.fallback, { color: colors.textSecondary }]}>
            {REWARDS_PENDING_LINE}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: 56,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detail: {
    fontSize: Typography.sizes.sm,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 1,
    maxWidth: '60%',
  },
  value: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    textAlign: 'right',
    flexShrink: 1,
  },
  fallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  fallback: {
    flexShrink: 1,
    fontSize: Typography.sizes.base,
  },
});
