import React, { useEffect, useState } from 'react';
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
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { getMyBattles } from '@/utils/battles';
import {
  AnimatedNumber,
  Card,
  HapticPressable,
  ProgressBar,
  ScreenContainer,
  SectionHeader,
  StatGrid,
  type StatItem,
} from '@/components';

export default function StatsScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [recentBattles, setRecentBattles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getOpponentName = (battle: any): string => {
    if (!user) return 'opponent';
    if (battle.player_one_id === user.id) {
      return (
        battle.player_two?.display_name ||
        (battle.is_player_two_bot ? 'Bot' : 'Waiting…')
      );
    }
    return battle.player_one?.display_name || 'opponent';
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
      <ScreenContainer padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const total = profile?.total_battles || 0;
  const wins = profile?.wins || 0;
  const losses = profile?.losses || 0;
  const draws = profile?.draws || 0;
  const winRate = total > 0 ? wins / total : 0;
  const rating = Math.round(profile?.rating ?? 1500);

  const stats: StatItem[] = [
    { label: 'Battles', value: total, accent: colors.text },
    { label: 'Wins', value: wins, accent: colors.success },
    { label: 'Losses', value: losses, accent: colors.error },
    { label: 'Draws', value: draws, accent: colors.warning },
  ];

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: insets.bottom + Spacing.xxl,
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
        <HapticPressable
          onPress={() => router.back()}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={colors.text}
          />
          <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
        </HapticPressable>

        <SectionHeader
          title="Battle Stats"
          eyebrow="Your warrior's tale"
          size="hero"
        />

        {/* Rating hero */}
        <Card variant="neon" style={styles.ratingCard}>
          <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>
            GLICKO-2 RATING
          </Text>
          <View style={styles.ratingRow}>
            <MaterialCommunityIcons
              name="trophy"
              size={28}
              color={colors.gold}
            />
            <AnimatedNumber
              value={rating}
              style={[styles.ratingValue, { color: colors.text }]}
            />
          </View>
        </Card>

        {/* Stats grid */}
        <View style={styles.section}>
          <StatGrid stats={stats} columns={2} />
        </View>

        {/* Win rate */}
        <Card variant="glass" style={styles.section}>
          <View style={styles.winRateHeader}>
            <Text style={[styles.winRateLabel, { color: colors.text }]}>
              Win Rate
            </Text>
            <Text style={[styles.winRatePercent, { color: colors.accent }]}>
              {Math.round(winRate * 100)}%
            </Text>
          </View>
          <ProgressBar
            progress={winRate}
            gradient={Gradients.heroPrimary as unknown as readonly [string, string]}
          />
        </Card>

        {/* Recent battles */}
        {recentBattles.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Battles" size="md" />
            <Card variant="glass" style={{ padding: 0 }}>
              {recentBattles.map((battle, idx) => {
                const isWin = battle.winner_id === user?.id;
                const isDraw = battle.is_draw;
                const tint = isDraw
                  ? colors.warning
                  : isWin
                  ? colors.success
                  : colors.error;
                const label = isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSS';
                return (
                  <View
                    key={battle.id}
                    style={[
                      styles.battleRow,
                      idx < recentBattles.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.battleOpponent, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        vs {getOpponentName(battle)}
                      </Text>
                      <Text
                        style={[styles.battleDate, { color: colors.textTertiary }]}
                      >
                        {new Date(battle.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.resultPill,
                        {
                          backgroundColor: `${tint}26`,
                          borderColor: tint,
                        },
                      ]}
                    >
                      <Text style={[styles.resultText, { color: tint }]}>
                        {label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Card>
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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  backText: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
  },
  ratingCard: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  ratingLabel: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ratingValue: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.hero,
    lineHeight: Typography.sizes.hero,
  },
  section: {
    marginTop: Spacing.lg,
  },
  winRateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  winRateLabel: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
  },
  winRatePercent: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.xl,
  },
  battleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  battleOpponent: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
  },
  battleDate: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  resultPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  resultText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: Typography.letterSpacing.wider,
  },
});
