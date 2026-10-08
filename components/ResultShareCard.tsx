import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GameText as Text, GameBevel } from '@/components/game';
import BrandMark from '@/components/game/BrandMark';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { inkFor } from '@/utils/contrast';
import type { BattleOutcome } from '@/utils/resultView';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import PortraitPreview from '@/components/PortraitPreview';

export interface ShareCardFighter {
  name: string;
  archetype: string | null;
  /** A fresh signed avatar URL; the bundled archetype art when null. */
  avatarUrl: string | null;
  signatureColor?: string | null;
  cosmetics?: EquippedCosmetics;
}

export interface ResultShareCardProps {
  /** From `outcomeHeadline`. */
  headline: string;
  outcome: BattleOutcome | 'no_contest';
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
  adjudicationRevision?: number;
  onArtworkLoaded?: (asset: string) => void;
  onArtworkError?: () => void;
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
  headline: _headline,
  outcome,
  isKo: originalKo,
  scoreLine: originalScore,
  me,
  them,
  winnerSide: originalWinner,
  theme,
  ratingLine,
  accentColor,
  adjudicationRevision = 0,
  onArtworkLoaded,
  onArtworkError,
}: ResultShareCardProps) {
  const noContest = outcome === 'no_contest';
  const headline = {
    won: 'Victory',
    lost: 'Defeat',
    draw: 'Draw',
    no_contest: 'No contest',
  }[outcome];
  const isKo = !noContest && originalKo;
  const scoreLine = noContest ? null : originalScore;
  const winnerSide = noContest || outcome === 'draw' ? null : originalWinner;
  const colors = useThemedColors();
  const accent = accentColor ?? colors.primary;
  const outcomeColor =
    outcome === 'draw' || noContest
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
    adjudicationRevision > 0
      ? `Reviewed result, revision ${adjudicationRevision}`
      : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card }]}
      accessible
      accessibilityLabel={label}
    >
      <GameBevel color={colors.ornament} insetColor={colors.ornamentMuted} />
      <BrandMark size={180} />
      <Text
        variant="display"
        style={[styles.headline, { color: outcomeColor }]}
        accessibilityRole="header"
      >
        {headline}
      </Text>
      {scoreLine ? (
        <View style={{ alignSelf: 'stretch', alignItems: 'center' }}>
          <Text variant="title" style={[styles.score, NumericFontVariant]}>
            {scoreLine}
          </Text>
        </View>
      ) : null}
      <View style={styles.fighters}>
        <Fighter
          fighter={me}
          isWinner={winnerSide === 'me'}
          accent={accent}
          who="You"
          onLoad={(kind) => onArtworkLoaded?.('me:' + kind)}
          onError={onArtworkError}
        />
        <Text
          variant="label"
          style={{ color: colors.textTertiary, paddingTop: 24 }}
        >
          VS
        </Text>
        <Fighter
          fighter={them}
          isWinner={winnerSide === 'them'}
          accent={accent}
          who="Opponent"
          onLoad={(kind) => onArtworkLoaded?.('them:' + kind)}
          onError={onArtworkError}
        />
      </View>

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

      {adjudicationRevision > 0 && (
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          Reviewed result · revision {adjudicationRevision}
        </Text>
      )}
    </View>
  );
}

function Fighter({
  fighter,
  isWinner,
  accent,
  who,
  onLoad,
  onError,
}: {
  fighter: ShareCardFighter;
  isWinner: boolean;
  accent: string;
  who: string;
  onLoad: (kind: string) => void;
  onError?: () => void;
}) {
  const colors = useThemedColors();
  const uri =
    fighter.avatarUrl ?? archetypeIllustrationUri(fighter.archetype) ?? '';

  return (
    <View style={styles.fighter}>
      <View style={styles.avatarWrap}>
        <PortraitPreview
          uri={uri}
          size={AVATAR_SIZE}
          frame={fighter.cosmetics?.frame}
          avatarEffect={fighter.cosmetics?.avatarEffect}
          accentColor={fighter.signatureColor ?? accent}
          onImageLoad={() => onLoad('avatar')}
          onFrameImageLoad={() => onLoad('frame')}
          onImageError={onError}
          onFrameImageError={onError}
          accessibilityLabel={fighter.name}
        />
        {isWinner ? (
          <View
            style={[styles.trophy, { backgroundColor: accent }]}
            testID="share-card-winner-badge"
          >
            <GameSymbol name="trophy" size={12} color={inkFor(accent)} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.who, { color: colors.textTertiary }]}>{who}</Text>
      <Text variant="fighter" style={[styles.name, { color: colors.text }]}>
        {fighter.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
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
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  centre: {
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: AVATAR_SIZE / 2 - Typography.sizes.xxl / 2,
  },
  score: {
    fontSize: 40,
    lineHeight: 48,
    flexShrink: 0,
    fontWeight: Typography.weights.bold,
  },
  vs: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  headline: {
    fontSize: 36,
    lineHeight: 42,
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
