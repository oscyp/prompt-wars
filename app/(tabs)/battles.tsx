import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { getMyBattles } from '@/utils/battles';
import { useAuth } from '@/providers/AuthProvider';

export default function BattlesScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const [battles, setBattles] = useState<any[]>([]);
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

  const getIsWinner = (battle: any): boolean => {
    if (!user || !battle.winner_id) return false;
    return battle.winner_id === user.id;
  };

  const loadBattles = async () => {
    try {
      const data = await getMyBattles(50);
      setBattles(data || []);
    } catch (err) {
      console.error('Failed to load battles:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBattles();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadBattles();
  };

  const navigateToBattle = (battle: any) => {
    if (battle.status === 'waiting_for_prompts') {
      router.push(`/(battle)/prompt-entry?battleId=${battle.id}`);
    } else if (battle.status === 'result_ready' || battle.status === 'completed') {
      router.push(`/(battle)/result?battleId=${battle.id}`);
    } else {
      router.push(`/(battle)/waiting?battleId=${battle.id}`);
    }
  };

  const statusColor = (status: string): string => {
    if (status === 'completed') return colors.success;
    if (status === 'expired' || status === 'canceled') return colors.error;
    return colors.textSecondary;
  };

  const renderBattle = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[
        styles.battleCard,
        { backgroundColor: colors.card, borderColor: colors.borderLight },
      ]}
      onPress={() => navigateToBattle(item)}
      accessibilityLabel={`Battle against ${getOpponentName(item)}`}
      accessibilityRole="button"
    >
      {/* Opponents' characters are RLS-protected; show the designed neutral
          illustration (never a bare initial). */}
      <Image
        source={getArchetypeAvatar(null)}
        style={styles.avatar}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.battleBody}>
        <View style={styles.battleHeader}>
          <Text style={[styles.opponent, { color: colors.text }]} numberOfLines={1}>
            vs {getOpponentName(item)}
          </Text>
          <View
            style={[
              styles.statusChip,
              { borderColor: statusColor(item.status) },
            ]}
          >
            <Text style={[styles.status, { color: statusColor(item.status) }]}>
              {item.status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
        {item.theme && (
          <Text
            style={[styles.theme, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            Theme: {item.theme}
          </Text>
        )}
        <View style={styles.battleFooter}>
          {item.winner_id ? (
            <Text
              style={[
                styles.result,
                { color: item.is_draw ? colors.warning : getIsWinner(item) ? colors.success : colors.error },
              ]}
            >
              {item.is_draw ? 'Draw' : getIsWinner(item) ? 'Victory' : 'Defeat'}
            </Text>
          ) : (
            <View />
          )}
          <Text style={[styles.date, { color: colors.textTertiary }]}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
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
      <Text style={[styles.title, { color: colors.text }]}>Battle History</Text>
      {battles.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No battles yet. Start your first battle!
          </Text>
        </View>
      ) : (
        <FlatList
          data={battles}
          renderItem={renderBattle}
          keyExtractor={(item) => item.id}
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
    marginBottom: Spacing.md,
  },
  list: {
    paddingBottom: Spacing.lg,
  },
  battleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  battleBody: {
    flex: 1,
  },
  battleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  opponent: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  status: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'capitalize',
  },
  theme: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  battleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  result: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  date: {
    fontSize: Typography.sizes.xs,
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
