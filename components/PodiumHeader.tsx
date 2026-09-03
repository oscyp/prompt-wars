import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
    <View style={styles.podium} testID="podium-header">
      {PODIUM_ORDER.map((index) => {
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
          <View
            key={row.id || row.profile_id}
            style={[
              styles.card,
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
              <Ionicons
                name={medalFor(row.rank) === 'gold' ? 'trophy' : 'medal'}
                size={14}
                color={medal}
              />
              <Text style={[styles.rank, NumericFontVariant, { color: medal }]}>
                {rankDisplay(row.rank)}
              </Text>
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
              <Text
                style={[styles.name, accessibleText, { color: colors.text }]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <CosmeticBadge badge={player?.cosmetics.badge} size={12} />
            </View>
            {isViewer ? (
              <Text
                style={[
                  styles.youTag,
                  { color: colors.primary, borderColor: colors.primary },
                ]}
              >
                You
              </Text>
            ) : null}
            <Text
              style={[
                styles.rating,
                NumericFontVariant,
                { color: colors.primary },
              ]}
            >
              {Math.round(row.rating)}
            </Text>
          </View>
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
    borderRadius: BorderRadius.lg,
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
    fontSize: Typography.sizes.xs,
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
