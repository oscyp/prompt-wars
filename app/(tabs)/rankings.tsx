import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';

export default function RankingsScreen() {
  const colors = useThemedColors();
  const [rankings, setRankings] = useState<any[]>([]);
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

      // Get rankings for current season
      const { data: rankingsData, error } = await supabase
        .from('rankings')
        .select('*, profile:profiles(username, display_name)')
        .order('rank', { ascending: true })
        .limit(50);

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

  const renderRanking = ({ item, index }: { item: any; index: number }) => (
    <View style={[styles.rankingCard, { backgroundColor: colors.card }]}>
      <Text
        style={[
          styles.rank,
          {
            color:
              item.rank === 1
                ? '#FFD700'
                : item.rank === 2
                ? '#C0C0C0'
                : item.rank === 3
                ? '#CD7F32'
                : colors.text,
          },
        ]}
      >
        #{item.rank}
      </Text>
      <View style={styles.playerInfo}>
        <Text style={[styles.playerName, { color: colors.text }]}>
          {item.profile?.display_name || item.profile?.username || 'Unknown'}
        </Text>
        <Text style={[styles.stats, { color: colors.textSecondary }]}>
          {item.wins}W - {item.losses}L - {item.draws}D
        </Text>
      </View>
      <Text style={[styles.rating, { color: colors.primary }]}>
        {Math.round(item.rating)}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  rank: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    width: 60,
  },
  playerInfo: {
    flex: 1,
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
