import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import type { ProgressionRow, RatingView } from '@/utils/profileView';

export type ProgressionRoute = NonNullable<ProgressionRow['route']>;

export interface ProgressionStripProps {
  rating: RatingView;
  rows: readonly ProgressionRow[];
  onNavigate: (route: ProgressionRoute) => void;
  /** The reads behind the strip failed: show one line and a Retry instead. */
  error?: boolean;
  onRetry?: () => void;
}

export const PROGRESS_TITLE = 'Progress';

export const PROGRESS_ERROR_COPY = {
  body: 'Couldn’t load your progress.',
  retry: 'Retry',
} as const;

/** What a screen reader says for the rating row. */
export function ratingRowLabel(view: RatingView): string {
  return view.rated
    ? `Rating ${view.value}`
    : `Rating: ${view.value.toLowerCase()}. ${view.caption}`;
}

/**
 * Where the player stands: rating, win streak, login streak, season rank and
 * the nearest unlock. Rows that lead somewhere are buttons with a chevron;
 * the rest are information only. The lifetime record is deliberately absent —
 * it lives on the Stats screen.
 */
export default function ProgressionStrip({
  rating,
  rows,
  onNavigate,
  error = false,
  onRetry,
}: ProgressionStripProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <Text
        style={[styles.title, accessibleText, { color: colors.text }]}
        accessibilityRole="header"
      >
        {PROGRESS_TITLE}
      </Text>

      {error ? (
        <View style={styles.errorRow}>
          <Text
            style={[
              styles.errorText,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            {PROGRESS_ERROR_COPY.body}
          </Text>
          <Pressable
            onPress={onRetry}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel={PROGRESS_ERROR_COPY.retry}
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>
              {PROGRESS_ERROR_COPY.retry}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Row
            label="Rating"
            value={rating.value}
            detail={rating.rated ? undefined : rating.caption}
            tone="neutral"
            accessibilityLabel={ratingRowLabel(rating)}
          />
          {rows.map((row) => (
            <Row
              key={row.key}
              label={row.label}
              value={row.value}
              detail={row.detail}
              tone={row.tone}
              accessibilityLabel={row.accessibilityLabel}
              onPress={row.route ? () => onNavigate(row.route!) : undefined}
            />
          ))}
        </>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  detail,
  tone,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: ProgressionRow['tone'];
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const valueColor = tone === 'up' ? colors.success : colors.text;

  const body = (
    <>
      <View style={styles.rowText}>
        <Text
          style={[
            styles.label,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            style={[
              styles.detail,
              accessibleText,
              { color: colors.textTertiary },
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <Text
        style={[styles.value, NumericFontVariant, { color: valueColor }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {onPress ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { borderTopColor: colors.border },
          pressed ? styles.pressed : null,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View
      style={[styles.row, { borderTopColor: colors.border }]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: Typography.sizes.base,
  },
  detail: {
    fontSize: Typography.sizes.sm,
  },
  value: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    maxWidth: '50%',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    paddingBottom: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  retry: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  retryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
