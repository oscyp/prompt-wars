import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
  Layout,
} from '@/constants/DesignTokens';
import { HEADER_BUTTON_SIZE } from '@/components/HeaderBackButton';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { getMyBattles } from '@/utils/battles';
import { PUBLIC_PROFILE_COLUMNS } from '@/utils/profiles';
import {
  battleOutcomeFor,
  battleStatusView,
  opponentNameFor,
  type BattleOutcome,
} from '@/utils/battleCopy';
import { winRateLabel } from '@/utils/walletView';

interface ProfileStats {
  rating: number | null;
  total_battles: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  current_streak: number | null;
  best_streak: number | null;
}

interface BattleRow {
  id: string;
  status: string;
  player_one_id: string;
  player_two_id: string | null;
  is_player_two_bot: boolean | null;
  winner_id: string | null;
  is_draw: boolean | null;
  player_one_locked_at?: string | null;
  player_two_locked_at?: string | null;
  player_one?: {
    display_name?: string | null;
    username?: string | null;
  } | null;
  player_two?: {
    display_name?: string | null;
    username?: string | null;
  } | null;
}

type LoadState = 'loading' | 'ready' | 'error';

const OUTCOME_LABEL: Record<Exclude<BattleOutcome, 'pending'>, string> = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
};

export default function StatsScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileStats | null>(null);
  const [recentBattles, setRecentBattles] = useState<BattleRow[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);

  const loadStats = useCallback(async () => {
    if (!user) {
      // Never spin forever: without a user there is nothing to load, and the
      // auth gate will be on its way to sign-in.
      setLoadState('error');
      return;
    }

    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq('id', user.id)
        .single();
      if (error || !profileData) {
        throw new Error(error?.message ?? 'Profile not found');
      }

      const battles = await getMyBattles(10);
      setProfile(profileData as unknown as ProfileStats);
      setRecentBattles((battles ?? []) as unknown as BattleRow[]);
      setLoadState('ready');
      hasLoaded.current = true;
    } catch (err) {
      console.error('Failed to load stats:', err);
      // Keep the last good numbers on a refetch failure; only show the error
      // state when there is nothing truthful to show instead. Never fabricate
      // a 1500 rating for a profile that did not load.
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  // Re-read on every return to the screen: a battle finished in between
  // should be in the record without a pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      if (!hasLoaded.current) setLoadState('loading');
      loadStats();
    }, [loadStats]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadStats();
  };

  const retry = () => {
    setLoadState('loading');
    loadStats();
  };

  const topInset = insets.top + HEADER_BUTTON_SIZE;

  if (loadState === 'loading') {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadState === 'error' || !profile || !user) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <Ionicons
          name="stats-chart-outline"
          size={32}
          color={colors.textTertiary}
        />
        <Text
          accessibilityRole="header"
          style={[styles.errorTitle, accessibleText, { color: colors.text }]}
        >
          Couldn’t load your stats
        </Text>
        <Text
          style={[
            styles.errorBody,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalBattles = profile.total_battles ?? 0;
  const wins = profile.wins ?? 0;
  const losses = profile.losses ?? 0;
  const draws = profile.draws ?? 0;
  const winRate = winRateLabel(wins, totalBattles);
  const rating = profile.rating;

  const toneColor = (
    tone: ReturnType<typeof battleStatusView>['tone'],
  ): string => {
    switch (tone) {
      case 'success':
        return colors.success;
      case 'error':
        return colors.error;
      case 'warning':
        return colors.warning;
      case 'primary':
        return colors.primary;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topInset }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, accessibleText, { color: colors.text }]}
      >
        Your Stats
      </Text>

      {/* Overall Stats */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Overall Record
        </Text>
        <View style={styles.statsGrid}>
          <StatBox
            label="Battles"
            value={totalBattles}
            color={colors.primary}
            colors={colors}
          />
          <StatBox
            label="Wins"
            value={wins}
            color={colors.success}
            colors={colors}
          />
          <StatBox
            label="Losses"
            value={losses}
            color={colors.error}
            colors={colors}
          />
          <StatBox
            label="Draws"
            value={draws}
            color={colors.warning}
            colors={colors}
          />
        </View>
        <View
          style={[styles.keyValueRow, { borderTopColor: colors.border }]}
          accessible
          accessibilityLabel={`Win rate ${winRate}`}
        >
          <Text
            style={[
              styles.keyLabel,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            Win Rate
          </Text>
          <Text
            style={[
              styles.keyValue,
              NumericFontVariant,
              { color: colors.primary },
            ]}
          >
            {winRate}
          </Text>
        </View>
        <View
          style={[styles.keyValueRow, { borderTopColor: colors.border }]}
          accessible
          accessibilityLabel={`Current streak ${profile.current_streak ?? 0}, best streak ${
            profile.best_streak ?? 0
          }`}
        >
          <Text
            style={[
              styles.keyLabel,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            Win Streak
          </Text>
          <Text
            style={[
              styles.keyValue,
              NumericFontVariant,
              { color: colors.text },
            ]}
          >
            {`${profile.current_streak ?? 0} now · ${profile.best_streak ?? 0} best`}
          </Text>
        </View>
      </View>

      {/* Rating */}
      <View
        style={[styles.card, { backgroundColor: colors.card }]}
        accessible
        accessibilityLabel={
          rating === null || rating === undefined
            ? 'Rating not available yet'
            : `Rating ${Math.round(rating)}`
        }
      >
        <Text
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Rating
        </Text>
        <Text
          style={[
            styles.ratingValue,
            NumericFontVariant,
            { color: colors.primary },
          ]}
        >
          {rating === null || rating === undefined ? '—' : Math.round(rating)}
        </Text>
      </View>

      {/* Recent Battles */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Recent Battles
        </Text>
        {recentBattles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text
              style={[
                styles.emptyTitle,
                accessibleText,
                { color: colors.text },
              ]}
            >
              No battles yet
            </Text>
            <Text
              style={[
                styles.emptyHint,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              Your record fills in as you fight. Start one from the Battle
              button.
            </Text>
          </View>
        ) : (
          recentBattles.map((battle, index) => {
            const isPlayerOne = battle.player_one_id === user.id;
            const opponentProfile = isPlayerOne
              ? battle.player_two
              : battle.player_one;
            const opponent = opponentNameFor({
              isBot: isPlayerOne && Boolean(battle.is_player_two_bot),
              opponentName:
                opponentProfile?.display_name ?? opponentProfile?.username,
              hasOpponent: isPlayerOne
                ? Boolean(battle.player_two_id) ||
                  Boolean(battle.is_player_two_bot)
                : Boolean(battle.player_one_id),
            });
            const outcome = battleOutcomeFor(battle, user.id);
            const iHaveLocked = isPlayerOne
              ? Boolean(battle.player_one_locked_at)
              : Boolean(battle.player_two_locked_at);
            const view = battleStatusView({
              status: battle.status,
              iHaveLocked,
              outcome,
            });
            const resolved = outcome !== 'pending';
            const label = resolved ? OUTCOME_LABEL[outcome] : view.label;
            const color = resolved
              ? outcome === 'win'
                ? colors.success
                : outcome === 'loss'
                  ? colors.error
                  : colors.warning
              : toneColor(view.tone);
            const last = index === recentBattles.length - 1;
            return (
              <TouchableOpacity
                key={battle.id}
                disabled={!resolved}
                onPress={() =>
                  router.push(`/(battle)/result?battleId=${battle.id}`)
                }
                accessibilityRole={resolved ? 'button' : 'text'}
                accessibilityLabel={`${label} against ${opponent}${
                  resolved ? '. Opens the result' : ''
                }`}
                style={[
                  styles.battleRow,
                  { borderBottomColor: colors.border },
                  last && styles.battleRowLast,
                ]}
              >
                <Text
                  style={[
                    styles.battleOpponent,
                    accessibleText,
                    { color: colors.text },
                  ]}
                  numberOfLines={1}
                >
                  vs {opponent}
                </Text>
                <View style={styles.battleTrailing}>
                  <Text style={[styles.battleResult, { color }]}>{label}</Text>
                  {resolved ? (
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textTertiary}
                    />
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

function StatBox({
  label,
  value,
  color,
  colors,
}: {
  label: string;
  value: number;
  color: string;
  colors: ReturnType<typeof useThemedColors>;
}) {
  return (
    <View
      style={styles.statBox}
      accessible
      accessibilityLabel={`${label} ${value}`}
    >
      <Text style={[styles.statValue, NumericFontVariant, { color }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  errorTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  errorBody: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.md,
    minHeight: Layout.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
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
  keyValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  keyLabel: {
    fontSize: Typography.sizes.base,
  },
  keyValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  ratingValue: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  emptyTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  emptyHint: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  battleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: Layout.inputHeight,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  battleRowLast: {
    borderBottomWidth: 0,
  },
  battleOpponent: {
    flex: 1,
    fontSize: Typography.sizes.base,
  },
  battleTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  battleResult: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
