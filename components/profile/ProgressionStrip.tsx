import { GameButton } from '@/components/game';
import { GamePanel, GameText } from '@/components/game';

import { Pressable, StyleSheet, View } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
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
    <GamePanel
      tone="ornate"
      style={[styles.card, { backgroundColor: colors.card }]}
    >
      <GameText
        variant="title"
        style={[styles.title, accessibleText, { color: colors.text }]}
        accessibilityRole="header"
      >
        {PROGRESS_TITLE}
      </GameText>

      {error ? (
        <View style={styles.errorRow}>
          <GameText
            variant="body"
            style={[
              styles.errorText,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            {PROGRESS_ERROR_COPY.body}
          </GameText>
          <GameButton
            onPress={onRetry}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel={PROGRESS_ERROR_COPY.retry}
            tone="secondary"
            label={PROGRESS_ERROR_COPY.retry}
          />
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
    </GamePanel>
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
        <GameText
          variant="label"
          style={[
            styles.label,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {label}
        </GameText>
        {detail ? (
          <GameText
            variant="body"
            style={[
              styles.detail,
              accessibleText,
              { color: colors.textTertiary },
            ]}
          >
            {detail}
          </GameText>
        ) : null}
      </View>
      <GameText
        variant="label"
        style={[styles.value, NumericFontVariant, { color: valueColor }]}
      >
        {value}
      </GameText>
      {onPress ? (
        <GameSymbol
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
    borderRadius: BorderRadius.sm,
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
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
    minHeight: 48,
    paddingBottom: Spacing.sm,
  },
  errorText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  retry: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  retryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
