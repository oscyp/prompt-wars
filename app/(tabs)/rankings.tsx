import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useTabClearance } from '@/hooks/useTabClearance';
import {
  Spacing,
  Typography,
  NumericFontVariant,
  BorderRadius,
} from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { CosmeticBadge, InlineBanner } from '@/components';
import {
  resolveEquippedCosmetics,
  type EquippedCosmetics,
} from '@/utils/cosmetics';
import {
  medalFor,
  rankDisplay,
  rankingPlayerName,
  rankingRowLabel,
  shouldPinViewerRow,
  type RankingRow,
} from '@/utils/rankingsView';

const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const LEADERBOARD_SIZE = 50;
const RANKING_SELECT =
  'id, profile_id, rank, rating, wins, losses, draws, profile:profiles(username, display_name)';

interface SeasonRow {
  id: string;
  name: string;
  ends_at: string;
}

interface RankingCardProps {
  row: RankingRow;
  isViewer: boolean;
  /** Rendered under the list because the viewer is outside the top 50. */
  pinned?: boolean;
  cosmetics: EquippedCosmetics | undefined;
}

function RankingCard({
  row,
  isViewer,
  pinned = false,
  cosmetics,
}: RankingCardProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const medal = medalFor(row.rank);
  const medalColor =
    medal === 'gold'
      ? colors.medalGold
      : medal === 'silver'
        ? colors.medalSilver
        : medal === 'bronze'
          ? colors.medalBronze
          : null;
  const emphasised = isViewer || medalColor !== null;
  const borderColor = isViewer
    ? colors.primary
    : (medalColor ?? colors.borderLight);
  const label = rankingRowLabel(row, isViewer);

  return (
    <View
      style={[
        styles.rankingCard,
        {
          backgroundColor: isViewer ? colors.backgroundSecondary : colors.card,
          borderColor,
          borderWidth: emphasised ? 1.5 : StyleSheet.hairlineWidth,
        },
        pinned && styles.pinnedCard,
      ]}
      accessible
      accessibilityLabel={pinned ? `Your standing. ${label}` : label}
    >
      <View style={styles.rankCell}>
        {/* Podium places get a glyph, never colour alone. */}
        {medal ? (
          <Ionicons
            name={medal === 'gold' ? 'trophy' : 'medal'}
            size={16}
            color={medalColor ?? colors.text}
          />
        ) : null}
        <Text
          style={[
            styles.rank,
            NumericFontVariant,
            { color: medalColor ?? colors.text },
          ]}
        >
          {rankDisplay(row.rank)}
        </Text>
      </View>
      {/* Other players' characters are RLS-protected; the designed neutral
          illustration stands in (never a bare initial). */}
      <Image
        source={getArchetypeAvatar(null)}
        style={[styles.avatar, { borderColor }]}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.playerInfo}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.playerName, accessibleText, { color: colors.text }]}
            numberOfLines={1}
          >
            {rankingPlayerName(row)}
          </Text>
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
          <CosmeticBadge badge={cosmetics?.badge} size={14} />
        </View>
        <Text
          style={[
            styles.stats,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {row.wins}W - {row.losses}L - {row.draws}D
        </Text>
      </View>
      <Text
        style={[styles.rating, NumericFontVariant, { color: colors.primary }]}
      >
        {Math.round(row.rating)}
      </Text>
    </View>
  );
}

export default function RankingsScreen() {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const tabClearance = useTabClearance();
  const { user } = useAuth();
  const userId = user?.id;
  const [rankings, setRankings] = useState<RankingRow[]>([]);
  const [viewerRow, setViewerRow] = useState<RankingRow | null>(null);
  const [cosmeticsByProfile, setCosmeticsByProfile] = useState<
    Map<string, EquippedCosmetics>
  >(new Map());
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastLoadRef = useRef(0);

  const loadRankings = useCallback(async () => {
    lastLoadRef.current = Date.now();
    try {
      const { data: seasonData, error: seasonError } = await supabase
        .from('seasons')
        .select('id, name, ends_at')
        .eq('is_active', true)
        .maybeSingle();
      if (seasonError) throw seasonError;
      const activeSeason = (seasonData as SeasonRow | null) ?? null;
      setSeason(activeSeason);

      // `rankings` is UNIQUE on (profile_id, season_id): without the season
      // filter two seasons interleave and two players both render as rank 1.
      let listQuery = supabase.from('rankings').select(RANKING_SELECT);
      if (activeSeason?.id)
        listQuery = listQuery.eq('season_id', activeSeason.id);
      const { data: rows, error } = await listQuery
        .order('rank', { ascending: true, nullsFirst: false })
        .limit(LEADERBOARD_SIZE);
      if (error) throw error;
      const listed = (rows ?? []) as unknown as RankingRow[];

      // The viewer's own row, wherever they stand. Not fatal if it fails.
      let viewer: RankingRow | null = null;
      if (userId) {
        let mineQuery = supabase
          .from('rankings')
          .select(RANKING_SELECT)
          .eq('profile_id', userId);
        if (activeSeason?.id)
          mineQuery = mineQuery.eq('season_id', activeSeason.id);
        const { data: mineRows } = await mineQuery.limit(1);
        viewer =
          ((mineRows ?? [])[0] as unknown as RankingRow | undefined) ?? null;
      }

      // Cosmetics live on `characters`, which is `select_own` under RLS, so the
      // leaderboard reads them through `public_player_cosmetics` -- a narrow
      // definer view exposing only profile_id and the equipped set -- and only
      // for the players actually on screen.
      const ids = Array.from(
        new Set([
          ...listed.map((r) => r.profile_id),
          ...(viewer ? [viewer.profile_id] : []),
        ]),
      );
      const byProfile = new Map<string, EquippedCosmetics>();
      if (ids.length > 0) {
        const { data: cosmeticRows } = await supabase
          .from('public_player_cosmetics')
          .select('profile_id, cosmetic_config')
          .in('profile_id', ids);
        for (const row of cosmeticRows ?? []) {
          byProfile.set(
            row.profile_id as string,
            resolveEquippedCosmetics(row.cosmetic_config),
          );
        }
      }

      setRankings(listed);
      setViewerRow(viewer);
      setCosmeticsByProfile(byProfile);
      setLoadError(false);
    } catch (err) {
      console.error('Failed to load rankings:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (lastLoadRef.current === 0) {
        void loadRankings();
        return;
      }
      if (Date.now() - lastLoadRef.current < FOCUS_REFETCH_DEBOUNCE_MS) return;
      void loadRankings();
    }, [loadRankings]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadRankings();
  };

  const pinViewer = shouldPinViewerRow(rankings, viewerRow);

  const renderRanking = ({ item }: { item: RankingRow }) => (
    <RankingCard
      row={item}
      isViewer={item.profile_id === userId}
      cosmetics={cosmeticsByProfile.get(item.profile_id)}
    />
  );

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
          styles.centered,
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const errorBanner = (
    <View style={styles.bannerWrap}>
      <InlineBanner
        tone="error"
        text="Couldn’t load the rankings."
        actionLabel="Retry"
        onAction={() => void loadRankings()}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + Spacing.sm,
        },
      ]}
    >
      <Text
        style={[styles.title, { color: colors.text }]}
        accessibilityRole="header"
      >
        Rankings
      </Text>
      {season ? (
        <Text
          style={[
            styles.season,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {season.name} • Ends {new Date(season.ends_at).toLocaleDateString()}
        </Text>
      ) : (
        <View style={styles.seasonSpacer} />
      )}

      <FlatList
        data={rankings}
        renderItem={renderRanking}
        keyExtractor={(item) => item.id || item.profile_id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: pinViewer ? Spacing.sm : tabClearance },
          rankings.length === 0 && styles.listEmpty,
        ]}
        ListHeaderComponent={
          loadError && rankings.length > 0 ? errorBanner : null
        }
        ListEmptyComponent={
          loadError ? (
            errorBanner
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No rankings yet
              </Text>
              <Text
                style={[
                  styles.emptyText,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                The season standings will appear here once ranked battles are
                played.
              </Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />

      {pinViewer && viewerRow ? (
        <View style={[styles.pinnedWrap, { paddingBottom: tabClearance }]}>
          <RankingCard
            row={viewerRow}
            isViewer
            pinned
            cosmetics={cosmeticsByProfile.get(viewerRow.profile_id)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  season: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.lg,
  },
  seasonSpacer: {
    height: Spacing.md,
  },
  list: {
    paddingBottom: Spacing.lg,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  bannerWrap: {
    marginBottom: Spacing.md,
  },
  rankingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  pinnedCard: {
    marginBottom: 0,
  },
  pinnedWrap: {
    paddingTop: Spacing.sm,
  },
  rankCell: {
    width: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rank: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  playerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  playerName: {
    flexShrink: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: 2,
  },
  youTag: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs,
  },
  stats: {
    fontSize: Typography.sizes.xs,
  },
  rating: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  emptyText: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
});
