import { GamePanel, GameText } from '@/components/game';

import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  BorderRadius,
  NumericFontVariant,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { resolveSignatureHex } from '@/utils/characters';
import type { PublicPlayerMap } from '@/utils/publicPlayers';
import {
  medalFor,
  podiumLabel,
  rankDisplay,
  rankingPlayerName,
  type RankingRow,
} from '@/utils/rankingsView';
import PortraitPreview from './PortraitPreview';
import CosmeticBadge from './CosmeticBadge';

export interface PodiumHeaderProps {
  /** The top three, in rank order (1, 2, 3). */
  rows: readonly RankingRow[];
  /** Archetype, colour and cosmetics by profile id; unknown players are neutral. */
  players?: PublicPlayerMap | null;
  viewerId?: string | null;
}

export const PODIUM_PORTRAIT_SIZE = 56;

/** Visual order: 2nd · 1st · 3rd, as indices into a rank-ordered top three. */
export const PODIUM_ORDER: readonly number[] = [1, 0, 2];

/**
 * The top three as a podium: the winner in the middle and taller, each card
 * showing the fighter's archetype art ringed in their signature colour, the
 * medal glyph (never colour alone), name and rating. The list below starts at
 * rank 4.
 */
export default function PodiumHeader({
  rows,
  players,
  viewerId,
}: PodiumHeaderProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 390 || fontScale > 1.15;
  if (rows.length < 3) return null;

  const medalColor = (rank: number | null) => {
    switch (medalFor(rank)) {
      case 'gold':
        return colors.medalGold;
      case 'silver':
        return colors.medalSilver;
      case 'bronze':
        return colors.medalBronze;
      default:
        return colors.border;
    }
  };

  return (
    <View
      style={[
        styles.podium,
        stacked && { flexDirection: 'column', alignItems: 'stretch' },
      ]}
      testID="podium-header"
    >
      {(stacked ? [0, 1, 2] : PODIUM_ORDER).map((index) => {
        const row = rows[index];
        if (!row) return null;
        const isFirst = index === 0;
        const isViewer = Boolean(viewerId) && row.profile_id === viewerId;
        const player = players?.get(row.profile_id);
        const medal = medalColor(row.rank);
        const ring = player?.signatureColor
          ? resolveSignatureHex(player.signatureColor)
          : colors.border;
        const name = rankingPlayerName(row);
        return (
          <GamePanel
            tone="ornate"
            key={row.id || row.profile_id}
            style={[
              styles.card,
              stacked && { flex: 0, width: '100%' },
              isFirst && styles.firstCard,
              {
                backgroundColor: isViewer
                  ? colors.backgroundSecondary
                  : colors.card,
                borderColor: isViewer ? colors.primary : medal,
              },
            ]}
            accessible
            accessibilityLabel={podiumLabel(row, isViewer)}
            testID={`podium-${row.rank}`}
          >
            <View style={styles.place}>
              <GameSymbol
                name={medalFor(row.rank) === 'gold' ? 'trophy' : 'medal'}
                size={14}
                color={medal}
              />
              <GameText
                variant="label"
                style={[styles.rank, NumericFontVariant, { color: medal }]}
              >
                {rankDisplay(row.rank)}
              </GameText>
            </View>
            <PortraitPreview
              uri={archetypeIllustrationUri(player?.archetype ?? null) ?? ''}
              variant="circle"
              size={PODIUM_PORTRAIT_SIZE}
              accentColor={ring}
              frame={player?.cosmetics.frame ?? null}
              avatarEffect={player?.cosmetics.avatarEffect ?? null}
              accessibilityLabel={`${name}'s archetype`}
            />
            <View style={styles.nameRow}>
              <GameText
                variant="fighter"
                style={[styles.name, accessibleText, { color: colors.text }]}
              >
                {name}
              </GameText>
              <CosmeticBadge badge={player?.cosmetics.badge} size={12} />
            </View>
            {isViewer ? (
              <GameText
                variant="body"
                style={[
                  styles.youTag,
                  { color: colors.primary, borderColor: colors.primary },
                ]}
              >
                You
              </GameText>
            ) : null}
            <GameText
              variant="label"
              style={[
                styles.rating,
                NumericFontVariant,
                { color: colors.primary },
              ]}
            >
              {Math.round(row.rating)}
            </GameText>
          </GamePanel>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
  },
  // The winner stands taller: same bottom edge, more headroom.
  firstCard: {
    paddingVertical: Spacing.md,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rank: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: '100%',
  },
  name: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
  },
  youTag: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs,
  },
  rating: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
});
