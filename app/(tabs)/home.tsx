import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { getDailyTheme, getDailyQuests, getMyBattles } from '@/utils/battles';
import { getWalletBalance } from '@/utils/monetization';
import { useAuth } from '@/providers/AuthProvider';

function getOpponentName(battle: any, currentUserId?: string): string {
  if (!currentUserId) return 'opponent';
  
  if (battle.player_one_id === currentUserId) {
    return battle.player_two?.display_name || (battle.is_player_two_bot ? 'Bot' : 'Finding opponent...');
  } else {
    return battle.player_one?.display_name || 'opponent';
  }
}

export default function HomeScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();

  const [dailyTheme, setDailyTheme] = useState<any>(null);
  const [quests, setQuests] = useState<any[]>([]);
  const [activeBattles, setActiveBattles] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [themeData, questsData, battlesData, balanceData] = await Promise.all([
        getDailyTheme(),
        getDailyQuests(),
        getMyBattles(5),
        getWalletBalance(),
      ]);

      setDailyTheme(themeData);
      setQuests(questsData);
      
      // Filter for active battles (not completed)
      const active = battlesData?.filter(
        (b: any) => !['completed', 'expired', 'canceled'].includes(b.status)
      ) || [];
      setActiveBattles(active);
      
      setBalance(balanceData);
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <Text style={[styles.title, { color: colors.text }]}>
        Prompt Wars
      </Text>

      {/* Credits Balance */}
      {balance && (
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => router.push('/(profile)/wallet')}
          accessibilityLabel="View wallet"
          accessibilityRole="button"
        >
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Credits</Text>
            {balance.is_subscriber && (
              <Text style={[styles.subscriberBadge, { color: colors.primary }]}>
                ✨ Prompt Wars+
              </Text>
            )}
          </View>
          <Text style={[styles.creditsAmount, { color: colors.primary }]}>
            {balance.credits_balance} Credits
          </Text>
          {balance.is_subscriber && (
            <Text style={[styles.cardSubtext, { color: colors.textSecondary }]}>
              {balance.monthly_video_allowance_remaining} video reveals remaining
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Daily Theme */}
      {dailyTheme && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Today's Theme
          </Text>
          <Text style={[styles.themeText, { color: colors.primary }]}>
            {dailyTheme.theme_text}
          </Text>
        </View>
      )}

      {/* Daily Quests */}
      {quests.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Daily Quests
          </Text>
          {quests.slice(0, 3).map((quest: any) => (
            <View key={quest.id} style={styles.questItem}>
              <Text style={[styles.questText, { color: colors.text }]}>
                {quest.quest?.description || 'Quest'}
              </Text>
              <View style={styles.questProgress}>
                <Text style={[styles.questStatus, { color: quest.completed ? colors.success : colors.textSecondary }]}>
                  {quest.completed ? '✓ Complete' : `${quest.current_value || 0}/${quest.quest?.target_value || 1}`}
                </Text>
                {!quest.completed && quest.quest?.reward_credits && (
                  <Text style={[styles.questReward, { color: colors.primary }]}>
                    +{quest.quest.reward_credits} credits
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Active Battles */}
      {activeBattles.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Active Battles
          </Text>
          {activeBattles.map((battle: any) => (
            <TouchableOpacity
              key={battle.id}
              style={styles.battleItem}
              onPress={() => {
                // Navigate based on battle status
                if (battle.status === 'waiting_for_prompts') {
                  router.push(`/(battle)/prompt-entry?battleId=${battle.id}`);
                } else if (battle.status === 'result_ready' || battle.status === 'completed') {
                  router.push(`/(battle)/result?battleId=${battle.id}`);
                } else {
                  router.push(`/(battle)/waiting?battleId=${battle.id}`);
                }
              }}
              accessibilityLabel={`View battle against ${getOpponentName(battle, user?.id)}`}
              accessibilityRole="button"
            >
              <Text style={[styles.battleOpponent, { color: colors.text }]}>
                vs {getOpponentName(battle, user?.id)}
              </Text>
              <Text style={[styles.battleStatus, { color: colors.textSecondary }]}>
                {battle.status.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Call to Action */}
      <TouchableOpacity
        style={[styles.ctaButton, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/(tabs)/create')}
        accessibilityLabel="Start a new battle"
        accessibilityRole="button"
      >
        <Text style={styles.ctaButtonText}>⚔️ Start Battle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xl,
  },
  card: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  cardText: {
    fontSize: Typography.sizes.sm,
  },
  cardSubtext: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.xs,
  },
  subscriberBadge: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  creditsAmount: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  themeText: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  questItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  questText: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xs,
  },
  questProgress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questStatus: {
    fontSize: Typography.sizes.sm,
  },
  questReward: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  battleItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  battleOpponent: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  battleStatus: {
    fontSize: Typography.sizes.sm,
    textTransform: 'capitalize',
  },
  ctaButton: {
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
});
