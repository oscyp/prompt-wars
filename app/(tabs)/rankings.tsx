import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  Spacing,
  Typography,
  NumericFontVariant,
  BorderRadius,
} from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { supabase } from '@/utils/supabase';
import { CosmeticBadge } from '@/components';
import {
  resolveEquippedCosmetics,
  type EquippedCosmetics,
} from '@/utils/cosmetics';

export default function RankingsScreen() {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const [rankings, setRankings] = useState<any[]>([]);
  const [cosmeticsByProfile, setCosmeticsByProfile] = useState<
    Map<string, EquippedCosmetics>
  >(new Map());
  const [season, setSeason] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRankings = async () => {
    try {
      // Get current season
      const { data: seasonData } = await supabase
        .from('seasons')
        .select('*')
        .eq('is_active', true)
        .single();

      setSeason(seasonData);

      // Get rankings for current season.
      //
      // The season was fetched and then used only for the header text -- the
      // query itself had no season filter, despite `rankings` being UNIQUE on
      // (profile_id, season_id). With one season that happens to look right;
      // the moment a second exists the list interleaves seasons and `rank`
      // values collide, so two different players both render as rank 1.
      let query = supabase
        .from('rankings')
        .select('*, profile:profiles(username, display_name)')
        .order('rank', { ascending: true })
        .limit(50);

      if (seasonData?.id) {
        query = query.eq('season_id', seasonData.id);
      }

      const { data: rankingsData, error } = await query;

      // Cosmetics live on `characters`, which is `select_own` under RLS, so the
      // leaderboard reads them through `public_player_cosmetics` -- a narrow
      // definer view exposing only profile_id and the equipped set.
      const { data: cosmeticRows } = await supabase
        .from('public_player_cosmetics')
        .select('profile_id, cosmetic_config');
      const byProfile = new Map<string, EquippedCosmetics>(
        (cosmeticRows ?? []).map((row: any) => [
          row.profile_id as string,
          resolveEquippedCosmetics(row.cosmetic_config),
        ]),
      );
      setCosmeticsByProfile(byProfile);

      if (error) {
        console.error('Failed to load rankings:', error);
      } else {
        setRankings(rankingsData || []);
      }
    } catch (err) {
      console.error('Failed to load rankings:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadRankings();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadRankings();
  };

  const medalColor = (rank: number | null): string | null => {
    if (rank === 1) return colors.medalGold;
    if (rank === 2) return colors.medalSilver;
    if (rank === 3) return colors.medalBronze;
    return null;
  };

  const renderRanking = ({ item }: { item: any; index: number }) => {
    const medal = medalColor(item.rank);
    return (
      <View
        style={[
          styles.rankingCard,
          {
            backgroundColor: colors.card,
            borderColor: medal ?? colors.borderLight,
            borderWidth: medal ? 1.5 : StyleSheet.hairlineWidth,
          },
        ]}
        accessible
        accessibilityLabel={`Rank ${item.rank}: ${
          item.profile?.display_name || item.profile?.username || 'Unknown'
        }, rating ${Math.round(item.rating)}`}
      >
        <Text
          style={[
            styles.rank,
            NumericFontVariant,
            { color: medal ?? colors.text },
          ]}
        >
          #{item.rank}
        </Text>
        {/* Other players' characters are RLS-protected; the designed neutral
            illustration stands in (never a bare initial). */}
        <Image
          source={getArchetypeAvatar(null)}
          style={[
            styles.avatar,
            { borderColor: medal ?? colors.borderLight },
          ]}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={styles.playerInfo}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.playerName, { color: colors.text }]}
              numberOfLines={1}
            >
              {item.profile?.display_name || item.profile?.username || 'Unknown'}
            </Text>
            <CosmeticBadge
              badge={cosmeticsByProfile.get(item.profile_id)?.badge}
              size={14}
            />
          </View>
          <Text
            style={[styles.stats, NumericFontVariant, { color: colors.textSecondary }]}
          >
            {item.wins}W - {item.losses}L - {item.draws}D
          </Text>
        </View>
        <Text
          style={[styles.rating, NumericFontVariant, { color: colors.primary }]}
        >
          {Math.round(item.rating)}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top + Spacing.sm },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Rankings</Text>
      {season && (
        <Text style={[styles.season, { color: colors.textSecondary }]}>
          {season.name} • Ends {new Date(season.ends_at).toLocaleDateString()}
        </Text>
      )}

      {rankings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No rankings available yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={rankings}
          renderItem={renderRanking}
          keyExtractor={(item) => item.id || item.profile_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />
      )}
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
  list: {
    paddingBottom: Spacing.lg,
  },
  rankingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  rank: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    width: 48,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: 2,
  },
  stats: {
    fontSize: Typography.sizes.xs,
  },
  rating: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
});
