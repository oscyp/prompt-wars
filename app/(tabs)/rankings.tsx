import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Layout,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import {
  Card,
  ScreenContainer,
  SectionHeader,
} from '@/components';

const PODIUM_META = [
  {
    rank: 1,
    label: 'CHAMPION',
    gradient: Gradients.rankGold,
    icon: 'crown' as const,
    height: 132,
  },
  {
    rank: 2,
    label: 'RUNNER-UP',
    gradient: Gradients.rankSilver,
    icon: 'medal' as const,
    height: 108,
  },
  {
    rank: 3,
    label: 'THIRD',
    gradient: Gradients.rankBronze,
    icon: 'medal-outline' as const,
    height: 92,
  },
];

export default function RankingsScreen() {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const [rankings, setRankings] = useState<any[]>([]);
  const [season, setSeason] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRankings = async () => {
    try {
      const { data: seasonData } = await supabase
        .from('seasons')
        .select('*')
        .eq('is_active', true)
        .single();
      setSeason(seasonData);

      const { data: rankingsData } = await supabase
        .from('rankings')
        .select('*, profile:profiles(username, display_name)')
        .order('rank', { ascending: true })
        .limit(50);
      setRankings(rankingsData || []);
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

  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  const renderRow = ({ item }: { item: any }) => (
    <Card variant="glass" style={styles.row}>
      <Text style={[styles.rankNum, { color: colors.textSecondary }]}>
        #{item.rank}
      </Text>
      <View style={styles.rowMid}>
        <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
          {item.profile?.display_name || item.profile?.username || 'Unknown'}
        </Text>
        <Text style={[styles.wld, { color: colors.textSecondary }]}>
          {item.wins}W · {item.losses}L · {item.draws}D
        </Text>
      </View>
      <View style={[styles.ratingPill, { backgroundColor: `${colors.accent}1F`, borderColor: colors.accent }]}>
        <Text style={[styles.ratingText, { color: colors.accent }]}>
          {Math.round(item.rating)}
        </Text>
      </View>
    </Card>
  );

  if (isLoading) {
    return (
      <ScreenContainer padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer padded={false}>
      <FlatList
        data={rest}
        renderItem={renderRow}
        keyExtractor={(item) => item.id || item.profile_id}
        contentContainerStyle={[
          styles.list,
          {
            paddingBottom:
              insets.bottom + Layout.tabBarHeight + Spacing.xxl,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ paddingTop: insets.top + Spacing.lg }}>
            <SectionHeader
              title="Rankings"
              eyebrow={season?.name ?? 'Season'}
              subtitle={
                season
                  ? `Ends ${new Date(season.ends_at).toLocaleDateString()}`
                  : undefined
              }
              size="hero"
            />

            {top3.length > 0 && (
              <View style={styles.podium}>
                {[1, 0, 2].map((idx) => {
                  const player = top3[idx];
                  const meta = PODIUM_META[idx];
                  if (!player) {
                    return (
                      <View
                        key={`empty-${idx}`}
                        style={{ flex: 1, height: meta.height }}
                      />
                    );
                  }
                  return (
                    <View
                      key={player.id || player.profile_id}
                      style={[
                        styles.podiumCol,
                        Shadows.cardElevated,
                      ]}
                    >
                      <Text style={[styles.podiumName, { color: colors.text }]} numberOfLines={1}>
                        {player.profile?.display_name ||
                          player.profile?.username ||
                          '—'}
                      </Text>
                      <Text style={[styles.podiumRating, { color: colors.accent }]}>
                        {Math.round(player.rating)}
                      </Text>
                      <LinearGradient
                        colors={
                          meta.gradient as unknown as readonly [string, string]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.podiumBlock, { height: meta.height }]}
                      >
                        <MaterialCommunityIcons
                          name={meta.icon}
                          size={28}
                          color="#FFFFFF"
                        />
                        <Text style={styles.podiumRank}>#{meta.rank}</Text>
                        <Text style={styles.podiumLabel}>{meta.label}</Text>
                      </LinearGradient>
                    </View>
                  );
                })}
              </View>
            )}

            {rest.length > 0 && (
              <View style={{ marginTop: Spacing.xl, marginBottom: Spacing.md }}>
                <Text
                  style={[
                    styles.listHeader,
                    { color: colors.textSecondary },
                  ]}
                >
                  THE LADDER
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          rankings.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No rankings available yet
              </Text>
            </View>
          ) : null
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
  },
  podiumCol: {
    flex: 1,
    alignItems: 'center',
  },
  podiumName: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
    marginBottom: 2,
  },
  podiumRating: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.lg,
    marginBottom: Spacing.xs,
  },
  podiumBlock: {
    width: '100%',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  podiumRank: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.xl,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
  },
  podiumLabel: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: Typography.letterSpacing.widest,
  },
  listHeader: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  rankNum: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.lg,
    width: 48,
  },
  rowMid: {
    flex: 1,
  },
  playerName: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
    marginBottom: 2,
  },
  wld: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
  },
  ratingPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  ratingText: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.base,
  },
  empty: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.base,
  },
});
