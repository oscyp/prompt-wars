import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { inkFor } from '@/utils/contrast';
import type { BattleOutcome } from '@/utils/resultView';

export interface ShareCardFighter {
  name: string;
  archetype: string | null;
  /** A fresh signed avatar URL; the bundled archetype art when null. */
  avatarUrl: string | null;
}

export interface ResultShareCardProps {
  /** From `outcomeHeadline`. */
  headline: string;
  outcome: BattleOutcome;
  isKo: boolean;
  /** "2–1" on a series; null on single format, where the centre says VS. */
  scoreLine: string | null;
  me: ShareCardFighter;
  them: ShareCardFighter;
  /** Which side won; null on a draw. */
  winnerSide: 'me' | 'them' | null;
  theme: string | null;
  ratingLine: string | null;
  /** The winner's signature colour for the frame; the brand colour when null. */
  accentColor?: string | null;
}

export const KNOCKOUT_TAG = 'KNOCKOUT';
const AVATAR_SIZE = 64;

/**
 * The scorecard that gets shared: both fighters, the headline, the knockout
 * tag, the series score, the theme and the rating change, composed to survive
 * a PNG export at any width. Carries no AI disclosure (product decision, see
 * DESIGN_LANGUAGE.md).
 */
export default function ResultShareCard({
  headline,
  outcome,
  isKo,
  scoreLine,
  me,
  them,
  winnerSide,
  theme,
  ratingLine,
  accentColor,
}: ResultShareCardProps) {
  const colors = useThemedColors();
  const accent = accentColor ?? colors.primary;
  const outcomeColor =
    outcome === 'draw'
      ? colors.warning
      : outcome === 'won'
        ? colors.success
        : colors.error;

  const label = [
    headline,
    isKo ? 'Knockout' : null,
    `${me.name} versus ${them.name}${scoreLine ? `, ${scoreLine}` : ''}`,
    theme ? `Theme: ${theme}` : null,
    ratingLine,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: accent },
      ]}
      accessible
      accessibilityLabel={label}
    >
      <View style={styles.fighters}>
        <Fighter
          fighter={me}
          isWinner={winnerSide === 'me'}
          accent={accent}
          who="You"
        />
        <View style={styles.centre}>
          {scoreLine ? (
            <Text
              style={[styles.score, NumericFontVariant, { color: colors.text }]}
            >
              {scoreLine}
            </Text>
          ) : (
            <Text style={[styles.vs, { color: colors.textTertiary }]}>VS</Text>
          )}
        </View>
        <Fighter
          fighter={them}
          isWinner={winnerSide === 'them'}
          accent={accent}
          who="Opponent"
        />
      </View>

      <Text
        style={[styles.headline, NumericFontVariant, { color: outcomeColor }]}
        accessibilityRole="header"
      >
        {headline}
      </Text>

      {isKo ? (
        <View style={[styles.koTag, { borderColor: outcomeColor }]}>
          <Text style={[styles.koText, { color: outcomeColor }]}>
            {KNOCKOUT_TAG}
          </Text>
        </View>
      ) : null}

      {theme ? (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Theme: {theme}
        </Text>
      ) : null}
      {ratingLine ? (
        <Text
          style={[
            styles.meta,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {ratingLine}
        </Text>
      ) : null}

      <Text style={[styles.brand, { color: colors.textTertiary }]}>
        Prompt Wars
      </Text>
    </View>
  );
}

function Fighter({
  fighter,
  isWinner,
  accent,
  who,
}: {
  fighter: ShareCardFighter;
  isWinner: boolean;
  accent: string;
  who: string;
}) {
  const colors = useThemedColors();
  const [failed, setFailed] = useState(false);
  const source =
    fighter.avatarUrl && !failed
      ? { uri: fighter.avatarUrl }
      : getArchetypeAvatar(fighter.archetype);

  return (
    <View style={styles.fighter}>
      <View style={styles.avatarWrap}>
        <Image
          source={source}
          style={[
            styles.avatar,
            {
              borderColor: isWinner ? accent : colors.border,
              borderWidth: isWinner ? 3 : StyleSheet.hairlineWidth,
            },
          ]}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
        {isWinner ? (
          <View
            style={[styles.trophy, { backgroundColor: accent }]}
            testID="share-card-winner-badge"
          >
            <Ionicons name="trophy" size={12} color={inkFor(accent)} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.who, { color: colors.textTertiary }]}>{who}</Text>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
        {fighter.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fighters: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginBottom: Spacing.xs,
  },
  fighter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  trophy: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  name: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
  },
  centre: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: AVATAR_SIZE / 2 - Typography.sizes.xxl / 2,
  },
  score: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  vs: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  headline: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  koTag: {
    borderWidth: 2,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  koText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  meta: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  brand: {
    marginTop: Spacing.xs,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    letterSpacing: 0.6,
  },
});
