import { GameHeader } from '@/components/game';
import { GamePanel, GameText } from '@/components/game';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useTabClearance } from '@/hooks/useTabClearance';
import {
  Spacing,
  Typography,
  NumericFontVariant,
  BorderRadius,
} from '@/constants/DesignTokens';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { CosmeticBadge, InlineBanner, PortraitPreview } from '@/components';
import ListSkeleton from '@/components/ListSkeleton';
import PlayerSafetyActions from '@/components/PlayerSafetyActions';
import PodiumHeader from '@/components/PodiumHeader';
import {
  fetchPublicPlayers,
  type PublicPlayer,
  type PublicPlayerMap,
} from '@/utils/publicPlayers';
import { resolveSignatureHex } from '@/utils/characters';
import { seasonEndsLabel } from '@/utils/profileView';
import {
  medalFor,
  rankDisplay,
  rankingPlayerName,
  rankingRowLabel,
  recordLabel,
  shouldPinViewerRow,
  splitPodium,
  seasonAvailability,
  type RankingRow,
} from '@/utils/rankingsView';

const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const LEADERBOARD_SIZE = 50;
const RANKING_SELECT =
  'id, profile_id, rank, rating, wins, losses, draws, profile:profiles(username, display_name)';
const AVATAR_SIZE = 40;

interface SeasonRow {
  id: string;
  name: string;
  starts_at?: string;
  ends_at: string;
}

interface RankingCardProps {
  row: RankingRow;
  isViewer: boolean;
  /** Rendered under the list because the viewer is outside the top 50. */
  pinned?: boolean;
  /** Archetype, colour and cosmetics from the public view; neutral when absent. */
  player: PublicPlayer | undefined;
}

function RankingCard({
  row,
  isViewer,
  pinned = false,
  player,
}: RankingCardProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 390 || fontScale > 1.15;
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
  const name = rankingPlayerName(row);
  // The ring around a fighter is theirs (design language §4), not the row's.
  const ring = player?.signatureColor
    ? resolveSignatureHex(player.signatureColor)
    : colors.border;

  return (
    <GamePanel
      tone="ornate"
      style={[
        styles.rankingCard,
        stacked && styles.stackedRankingCard,
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
      <View style={[styles.placeAndPortrait, stacked && styles.stackedPlace]}>
        <View style={[styles.rankCell, stacked && styles.stackedRankCell]}>
          {/* Podium places get a glyph, never colour alone. */}
          {medal ? (
            <GameSymbol
              name={medal === 'gold' ? 'trophy' : 'medal'}
              size={16}
              color={medalColor ?? colors.text}
            />
          ) : null}
          <GameText
            variant="label"
            style={[
              styles.rank,
              NumericFontVariant,
              { color: medalColor ?? colors.text },
            ]}
          >
            {rankDisplay(row.rank)}
          </GameText>
        </View>
        {/* Other players' characters are RLS-protected; the public view gives
          the archetype and colour, and the bundled illustration stands in for
          the portrait (never a bare initial). */}
        <PortraitPreview
          uri={archetypeIllustrationUri(player?.archetype ?? null) ?? ''}
          variant="circle"
          size={AVATAR_SIZE}
          accentColor={ring}
          frame={player?.cosmetics.frame ?? null}
          avatarEffect={player?.cosmetics.avatarEffect ?? null}
          accessibilityLabel={`${name}'s archetype`}
        />
        {stacked ? (
          <GameText
            variant="label"
            style={[
              styles.rating,
              styles.stackedRating,
              NumericFontVariant,
              { color: colors.primary },
            ]}
          >
            {Math.round(row.rating)}
          </GameText>
        ) : null}
      </View>
      <View
        testID={`ranking-identity-${row.profile_id}`}
        style={[styles.playerInfo, stacked && styles.stackedPlayerInfo]}
      >
        <View style={[styles.nameRow, stacked && styles.stackedNameRow]}>
          <GameText
            variant="fighter"
            style={[
              styles.playerName,
              stacked && styles.stackedPlayerName,
              accessibleText,
              { color: colors.text },
            ]}
          >
            {name}
          </GameText>
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
          <CosmeticBadge badge={player?.cosmetics.badge} size={14} />
        </View>
        <GameText
          variant="body"
          style={[
            styles.stats,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {recordLabel(row)}
        </GameText>
      </View>
      {!stacked ? (
        <GameText
          variant="label"
          style={[styles.rating, NumericFontVariant, { color: colors.primary }]}
        >
          {Math.round(row.rating)}
        </GameText>
      ) : null}
    </GamePanel>
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
  const [players, setPlayers] = useState<PublicPlayerMap>(() => new Map());
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
        .select('id, name, starts_at, ends_at')
        .eq('is_active', true)
        .maybeSingle();
      if (seasonError) throw seasonError;
      let activeSeason = (seasonData as SeasonRow | null) ?? null;
      if (!activeSeason) {
        const { data: upcoming, error: upcomingError } = await supabase
          .from('seasons')
          .select('id, name, starts_at, ends_at')
          .gt('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(1);
        if (upcomingError) throw upcomingError;
        activeSeason = upcoming?.[0] ?? null;
        if (!activeSeason) {
          const { data: ended, error: endedError } = await supabase
            .from('seasons')
            .select('id, name, starts_at, ends_at')
            .order('ends_at', { ascending: false })
            .limit(1);
          if (endedError) throw endedError;
          activeSeason = ended?.[0] ?? null;
        }
      }
      setSeason(activeSeason);
      if (!activeSeason || seasonAvailability(activeSeason) !== 'active') {
        setRankings([]);
        setViewerRow(null);
        setLoadError(false);
        return;
      }

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

      // Archetype, colour and cosmetics live on `characters`, which is
      // `select_own` under RLS, so the leaderboard reads them through the
      // `public_player_cosmetics` view -- only for the players on screen.
      const known = await fetchPublicPlayers([
        ...listed.map((r) => r.profile_id),
        ...(viewer ? [viewer.profile_id] : []),
      ]);

      setRankings(listed);
      setViewerRow(viewer);
      setPlayers(known);
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

  // The top three become the podium; the list starts at rank 4. Pinning
  // checks the full leaderboard, so a viewer on the podium is not repeated.
  const { podium, rest } = useMemo(() => splitPodium(rankings), [rankings]);
  const pinViewer = shouldPinViewerRow(rankings, viewerRow);
  const availability = seasonAvailability(season);
  const emptyTitle =
    availability === 'upcoming'
      ? 'Season starts soon'
      : availability === 'ended'
        ? 'Season ended'
        : availability === 'unavailable'
          ? 'No season scheduled'
          : 'No rankings yet';
  const emptyBody =
    availability === 'upcoming'
      ? `Starts ${new Date(season!.starts_at!).toLocaleString()}`
      : availability === 'ended'
        ? 'The next season has not started yet.'
        : availability === 'unavailable'
          ? 'Check back for the next season.'
          : 'Standings will appear after ranked battles are played.';
  const seasonLine = season
    ? [
        season.name,
        availability === 'active' ? seasonEndsLabel(season.ends_at) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const renderRanking = ({ item }: { item: RankingRow }) => (
    <View>
      <RankingCard
        row={item}
        isViewer={item.profile_id === userId}
        player={players.get(item.profile_id)}
      />
      {item.profile_id !== userId ? (
        <PlayerSafetyActions
          profileId={item.profile_id}
          name={rankingPlayerName(item)}
        />
      ) : null}
    </View>
  );

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
      <GameHeader title="Rankings" style={{ marginBottom: 16 }} />
      {seasonLine ? (
        <GameText
          variant="body"
          style={[
            styles.season,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {seasonLine}
        </GameText>
      ) : (
        <View style={styles.seasonSpacer} />
      )}

      {isLoading ? (
        <ListSkeleton label="Loading the rankings" />
      ) : (
        <>
          <FlatList
            data={rest}
            renderItem={renderRanking}
            keyExtractor={(item) => item.id || item.profile_id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: pinViewer ? Spacing.sm : tabClearance },
              rankings.length === 0 && styles.listEmpty,
            ]}
            ListHeaderComponent={
              <>
                {loadError && rankings.length > 0 ? errorBanner : null}
                {podium.length === 3 ? (
                  <>
                    <PodiumHeader
                      rows={podium}
                      players={players}
                      viewerId={userId}
                    />
                    {podium
                      .filter((row) => row.profile_id !== userId)
                      .map((row) => (
                        <View
                          key={row.profile_id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <GameText
                            variant="body"
                            style={{ color: colors.text }}
                          >
                            {rankingPlayerName(row)}
                          </GameText>
                          <PlayerSafetyActions
                            profileId={row.profile_id}
                            name={rankingPlayerName(row)}
                          />
                        </View>
                      ))}
                  </>
                ) : null}
              </>
            }
            ListEmptyComponent={
              rankings.length > 0 ? null : loadError ? (
                errorBanner
              ) : (
                <View style={styles.emptyState}>
                  <GameText
                    variant="title"
                    style={[styles.emptyTitle, { color: colors.text }]}
                  >
                    {emptyTitle}
                  </GameText>
                  <GameText
                    variant="body"
                    style={[
                      styles.emptyText,
                      accessibleText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {emptyBody}
                  </GameText>
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
                player={players.get(viewerRow.profile_id)}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
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
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  stackedRankingCard: { flexDirection: 'column', alignItems: 'stretch' },
  placeAndPortrait: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stackedPlace: { flexWrap: 'wrap', width: '100%' },
  stackedRankCell: { width: 'auto', flexShrink: 1 },
  stackedRating: { marginLeft: 'auto', flexShrink: 1 },
  stackedPlayerInfo: { flex: 0, width: '100%' },
  stackedNameRow: { flexWrap: 'wrap', alignItems: 'flex-start' },
  stackedPlayerName: { width: '100%' },
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
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs,
  },
  stats: {
    fontSize: Typography.sizes.sm,
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
