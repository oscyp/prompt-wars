import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
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

  const renderBattle = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.battleCard, { backgroundColor: colors.card }]}
      onPress={() => navigateToBattle(item)}
      accessibilityLabel={`Battle against ${getOpponentName(item)}`}
      accessibilityRole="button"
    >
      <View style={styles.battleHeader}>
        <Text style={[styles.opponent, { color: colors.text }]}>
          vs {getOpponentName(item)}
        </Text>
        <Text
          style={[
            styles.status,
            {
              color:
                item.status === 'completed'
                  ? colors.success
                  : item.status === 'expired' || item.status === 'canceled'
                  ? colors.error
                  : colors.textSecondary,
            },
          ]}
        >
          {item.status.replace(/_/g, ' ')}
        </Text>
      </View>
      {item.theme && (
        <Text style={[styles.theme, { color: colors.textSecondary }]}>
          Theme: {item.theme}
        </Text>
      )}
      {item.winner_id && (
        <Text style={[styles.result, { color: item.is_draw ? colors.warning : colors.success }]}>
          {item.is_draw ? 'Draw' : getIsWinner(item) ? 'Victory' : 'Defeat'}
        </Text>
      )}
      <Text style={[styles.date, { color: colors.textTertiary }]}>
        {new Date(item.created_at).toLocaleDateString()}
      </Text>
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
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  battleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  opponent: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  status: {
    fontSize: Typography.sizes.sm,
    textTransform: 'capitalize',
  },
  theme: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  result: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
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
