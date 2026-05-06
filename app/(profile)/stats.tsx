import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { getMyBattles } from '@/utils/battles';

export default function StatsScreen() {
  const colors = useThemedColors();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [recentBattles, setRecentBattles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getOpponentName = (battle: any): string => {
    if (!user) return 'opponent';
    
    if (battle.player_one_id === user.id) {
      return battle.player_two?.display_name || (battle.is_player_two_bot ? 'Bot' : 'Waiting...');
    } else {
      return battle.player_one?.display_name || 'opponent';
    }
  };

  const loadStats = async () => {
    if (!user) return;

    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(profileData);

      const battles = await getMyBattles(10);
      setRecentBattles(battles || []);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const winRate = profile?.total_battles > 0 
    ? ((profile.wins / profile.total_battles) * 100).toFixed(1)
    : 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={[styles.title, { color: colors.text }]}>Your Stats</Text>

      {/* Overall Stats */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Overall Record</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {profile?.total_battles || 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Battles</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.success }]}>
              {profile?.wins || 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Wins</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.error }]}>
              {profile?.losses || 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Losses</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.warning }]}>
              {profile?.draws || 0}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Draws</Text>
          </View>
        </View>
        <View style={styles.winRateRow}>
          <Text style={[styles.winRateLabel, { color: colors.textSecondary }]}>Win Rate</Text>
          <Text style={[styles.winRateValue, { color: colors.primary }]}>{winRate}%</Text>
        </View>
      </View>

      {/* Rating */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Rating</Text>
        <Text style={[styles.ratingValue, { color: colors.primary }]}>
          {Math.round(profile?.rating || 1500)}
        </Text>
        <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>Glicko-2 Rating</Text>
      </View>

      {/* Recent Battles */}
      {recentBattles.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Recent Battles</Text>
          {recentBattles.map((battle) => (
            <View key={battle.id} style={styles.battleRow}>
              <Text style={[styles.battleOpponent, { color: colors.text }]}>
                vs {getOpponentName(battle)}
              </Text>
              <Text
                style={[
                  styles.battleResult,
                  {
                    color: battle.is_draw
                      ? colors.warning
                      : battle.winner_id === user?.id
                      ? colors.success
                      : colors.error,
                  },
                ]}
              >
                {battle.is_draw ? 'Draw' : battle.winner_id === user?.id ? 'Win' : 'Loss'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
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
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.xs,
  },
  winRateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  winRateLabel: {
    fontSize: Typography.sizes.base,
  },
  winRateValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  ratingValue: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  ratingLabel: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  battleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  battleOpponent: {
    fontSize: Typography.sizes.base,
  },
  battleResult: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
