import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Layout,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { getDailyTheme, getDailyQuests, getMyBattles } from '@/utils/battles';
import { getWalletBalance } from '@/utils/monetization';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';
import {
  AnimatedNumber,
  ArchetypeBadge,
  Card,
  GlowGradientButton,
  HapticPressable,
  ProgressBar,
  ScreenContainer,
  SectionHeader,
} from '@/components';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';

function getOpponentName(battle: any, currentUserId?: string): string {
  if (!currentUserId) return 'opponent';
  if (battle.player_one_id === currentUserId) {
    return (
      battle.player_two?.display_name ||
      (battle.is_player_two_bot ? 'Bot' : 'Finding…')
    );
  }
  return battle.player_one?.display_name || 'opponent';
}

export default function HomeScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [dailyTheme, setDailyTheme] = useState<any>(null);
  const [quests, setQuests] = useState<any[]>([]);
  const [activeBattles, setActiveBattles] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [themeData, questsData, battlesData, balanceData] =
        await Promise.all([
          getDailyTheme(),
          getDailyQuests(),
          getMyBattles(5),
          getWalletBalance(),
        ]);

      setDailyTheme(themeData);
      setQuests(questsData);
      const active =
        battlesData?.filter(
          (b: any) =>
            !['completed', 'expired', 'canceled'].includes(b.status)
        ) || [];
      setActiveBattles(active);
      setBalance(balanceData);

      if (user) {
        const [{ data: charData }, { data: profData }] = await Promise.all([
          supabase
            .from('characters')
            .select('*')
            .eq('profile_id', user.id)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select('display_name, username, rating')
            .eq('id', user.id)
            .maybeSingle(),
        ]);
        setCharacter(charData);
        setProfile(profData);
      }
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (isLoading) {
    return (
      <ScreenContainer padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const archetypeId = (character?.archetype as ArchetypeId) ?? 'strategist';
  const archetype = ARCHETYPES[archetypeId];
  const displayName =
    character?.name || profile?.display_name || profile?.username || 'Warrior';

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
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
      >
        {/* Hero header */}
        <Card variant="gradient" archetypeId={archetypeId} style={styles.hero}>
          <View style={styles.heroRow}>
            <ArchetypeBadge archetypeId={archetypeId} size="lg" />
            <View style={styles.heroText}>
              <Text style={[styles.heroEyebrow, { color: 'rgba(255,255,255,0.75)' }]}>
                {archetype.shortName.toUpperCase()}
              </Text>
              <Text style={styles.heroName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.heroStatsRow}>
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={14}
                  color="rgba(255,255,255,0.9)"
                />
                <Text style={styles.heroStat}>
                  {Math.round(profile?.rating ?? 1500)} rating
                </Text>
              </View>
            </View>
          </View>
        </Card>

        {/* Credits */}
        {balance && (
          <HapticPressable
            onPress={() => router.push('/(profile)/wallet')}
            haptic="light"
            accessibilityRole="button"
            accessibilityLabel="View wallet"
          >
            <Card variant="glass" style={styles.creditsCard}>
              <View style={styles.creditsRow}>
                <View style={styles.creditsLeft}>
                  <View
                    style={[
                      styles.creditsIconWrap,
                      { backgroundColor: `${colors.gold}22` },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="diamond-stone"
                      size={20}
                      color={colors.gold}
                    />
                  </View>
                  <View>
                    <Text style={[styles.creditsLabel, { color: colors.textSecondary }]}>
                      Credits
                    </Text>
                    <AnimatedNumber
                      value={balance.credits_balance ?? 0}
                      style={[styles.creditsValue, { color: colors.text }]}
                    />
                  </View>
                </View>
                {balance.is_subscriber && (
                  <View
                    style={[
                      styles.proPill,
                      { backgroundColor: `${colors.primary}1F`, borderColor: colors.primary },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="star-four-points"
                      size={12}
                      color={colors.primary}
                    />
                    <Text style={[styles.proPillText, { color: colors.primary }]}>
                      PROMPT WARS+
                    </Text>
                  </View>
                )}
              </View>
              {balance.is_subscriber && (
                <Text style={[styles.creditsHint, { color: colors.textTertiary }]}>
                  {balance.monthly_video_allowance_remaining} video reveals remaining this month
                </Text>
              )}
            </Card>
          </HapticPressable>
        )}

        {/* Daily theme */}
        {dailyTheme && (
          <Card variant="neon" style={styles.themeCard}>
            <Text style={[styles.themeEyebrow, { color: colors.accent }]}>
              TODAY'S THEME
            </Text>
            <Text style={[styles.themeText, { color: colors.text }]}>
              "{dailyTheme.theme_text}"
            </Text>
          </Card>
        )}

        {/* CTA */}
        <View style={{ marginTop: Spacing.lg }}>
          <GlowGradientButton
            title="Start Battle"
            onPress={() => router.push('/(tabs)/create')}
            variant="primary"
            size="lg"
            fullWidth
            iconLeft="sword-cross"
            accessibilityLabel="Start a new battle"
          />
        </View>

        {/* Quests */}
        {quests.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Daily Quests" eyebrow="Earn credits" size="md" />
            {quests.slice(0, 3).map((quest: any) => {
              const target = quest.quest?.target_value || 1;
              const current = quest.current_value || 0;
              const progress = quest.completed ? 1 : Math.min(current / target, 1);
              return (
                <Card key={quest.id} variant="solid" style={styles.questCard}>
                  <View style={styles.questHeader}>
                    <Text style={[styles.questText, { color: colors.text }]}>
                      {quest.quest?.description || 'Quest'}
                    </Text>
                    {quest.quest?.reward_credits ? (
                      <View
                        style={[
                          styles.rewardPill,
                          { backgroundColor: `${colors.gold}22` },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="diamond-stone"
                          size={11}
                          color={colors.gold}
                        />
                        <Text style={[styles.rewardText, { color: colors.gold }]}>
                          +{quest.quest.reward_credits}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <ProgressBar
                    progress={progress}
                    gradient={
                      quest.completed
                        ? (Gradients.victory as unknown as readonly [string, string])
                        : (Gradients.heroPrimary as unknown as readonly [string, string])
                    }
                  />
                  <Text style={[styles.questStatus, { color: colors.textSecondary }]}>
                    {quest.completed
                      ? '✓ Complete'
                      : `${current} / ${target}`}
                  </Text>
                </Card>
              );
            })}
          </View>
        )}

        {/* Active battles */}
        {activeBattles.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Active Battles"
              actionLabel="See all"
              onActionPress={() => router.push('/(tabs)/battles')}
              size="md"
            />
            {activeBattles.map((battle: any) => (
              <HapticPressable
                key={battle.id}
                onPress={() => {
                  if (battle.status === 'waiting_for_prompts') {
                    router.push(`/(battle)/prompt-entry?battleId=${battle.id}`);
                  } else if (
                    battle.status === 'result_ready' ||
                    battle.status === 'completed'
                  ) {
                    router.push(`/(battle)/result?battleId=${battle.id}`);
                  } else {
                    router.push(`/(battle)/waiting?battleId=${battle.id}`);
                  }
                }}
                haptic="light"
                accessibilityRole="button"
                accessibilityLabel={`View battle vs ${getOpponentName(battle, user?.id)}`}
              >
                <Card variant="glass" style={styles.battleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.battleOpponent, { color: colors.text }]}>
                      vs {getOpponentName(battle, user?.id)}
                    </Text>
                    <Text style={[styles.battleStatus, { color: colors.textSecondary }]}>
                      {battle.status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textTertiary}
                  />
                </Card>
              </HapticPressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  hero: {
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  heroText: { flex: 1 },
  heroEyebrow: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: 2,
  },
  heroName: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.display3,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  heroStat: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.9)',
  },
  creditsCard: {
    marginBottom: Spacing.md,
  },
  creditsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creditsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  creditsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditsLabel: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  creditsValue: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.xxl,
  },
  creditsHint: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.sm,
  },
  proPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  proPillText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: Typography.letterSpacing.wider,
  },
  themeCard: {},
  themeEyebrow: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.xs,
  },
  themeText: {
    fontFamily: Typography.fonts.display,
    fontSize: Typography.sizes.xl,
    letterSpacing: Typography.letterSpacing.tight,
    lineHeight: Typography.sizes.xl * 1.3,
  },
  section: {
    marginTop: Spacing.xl,
  },
  questCard: {
    marginBottom: Spacing.sm,
  },
  questHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  questText: {
    flex: 1,
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
    marginRight: Spacing.sm,
  },
  questStatus: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.xs,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
  },
  rewardText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 11,
  },
  battleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  battleOpponent: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
    marginBottom: 2,
  },
  battleStatus: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    textTransform: 'capitalize',
  },
});
