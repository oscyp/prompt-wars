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
import Sparkline from '@/components/Sparkline';
import MoveUsageChips from '@/components/MoveUsageChips';
import { useAuth } from '@/providers/AuthProvider';
import { getBattleHistory, statusToneColor } from '@/utils/battleLists';
import {
  fetchHasRatedBattle,
  fetchProfileRow,
  type ProfileRow,
} from '@/utils/profileData';
import { ratingView } from '@/utils/profileView';
import {
  fetchMyPrompts,
  fetchRoundsForBattles,
  type MyPromptRow,
  type RoundScoreRow,
} from '@/utils/statsData';
import {
  BEST_PROMPTS_EMPTY,
  MOVES_EMPTY,
  TREND_EMPTY,
  bestPromptAccessibilityLabel,
  bestPromptMeta,
  bestPrompts,
  moveUsage,
  ratingTrend,
  recentBattleAccessibilityLabel,
  recentBattlesView,
  trendAccessibilityLabel,
  type StatsBattleRow,
} from '@/utils/statsInsights';
import { winRateLabel } from '@/utils/walletView';

type LoadState = 'loading' | 'ready' | 'error';

const BATTLE_HISTORY_LIMIT = 50;

/** One line per card when its reads failed; never a blank card. */
const INSIGHT_ERROR = {
  rating: 'Couldn’t load your rating.',
  trend: 'Couldn’t load your rating trend.',
  moves: 'Couldn’t load your moves.',
  bestPrompts: 'Couldn’t load your best prompts.',
  recent: 'Couldn’t load your recent battles.',
  retry: 'Retry',
} as const;

export default function StatsScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  // `null` on each of these means "that read failed": the card says so and
  // offers a retry rather than rendering an empty state that would be a lie.
  const [hasRated, setHasRated] = useState<boolean | null>(null);
  const [battles, setBattles] = useState<StatsBattleRow[] | null>(null);
  const [prompts, setPrompts] = useState<MyPromptRow[] | null>(null);
  const [rounds, setRounds] = useState<RoundScoreRow[] | null>(null);
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
      const [profileRes, battlesRes, ratedRes, promptsRes] =
        await Promise.allSettled([
          fetchProfileRow(user.id),
          getBattleHistory(BATTLE_HISTORY_LIMIT),
          fetchHasRatedBattle(user.id),
          fetchMyPrompts(user.id),
        ]);

      const profileRow =
        profileRes.status === 'fulfilled' ? profileRes.value : null;
      if (!profileRow) throw new Error('Profile not found');

      const battleRows =
        battlesRes.status === 'fulfilled'
          ? (battlesRes.value as StatsBattleRow[])
          : null;
      const rated = ratedRes.status === 'fulfilled' ? ratedRes.value : null;
      const promptRows =
        promptsRes.status === 'fulfilled' ? promptsRes.value : null;
      // Only the battles the player wrote a prompt in have rounds worth
      // scoring; a failed prompt read makes the round read moot.
      const roundRows = promptRows
        ? await fetchRoundsForBattles(promptRows.map((p) => p.battle_id))
        : null;

      setProfile(profileRow);
      setBattles(battleRows);
      setHasRated(rated);
      setPrompts(promptRows);
      setRounds(roundRows);
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

  /** Re-read without blanking the screen: the record is still worth reading. */
  const retryInsights = () => {
    setRefreshing(true);
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

  const rating =
    hasRated === null
      ? null
      : ratingView({ rating: profile.rating, hasRatedBattle: hasRated });
  const ratingA11y = rating
    ? rating.rated
      ? `Rating ${rating.value}`
      : `${rating.value}. ${rating.caption}`
    : '';
  const trend =
    battles === null ? null : ratingTrend(battles, user.id, profile.rating);

  const usage =
    prompts === null || rounds === null
      ? null
      : moveUsage(prompts, rounds, user.id);
  const best =
    prompts === null || rounds === null || battles === null
      ? null
      : bestPrompts(prompts, battles, rounds, user.id);
  const recent = battles === null ? null : recentBattlesView(battles, user.id);

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

      {/* Rating: the number, then how it got there. "Unrated" until a ranked
          battle against a human has been played -- the 1500 default is not a
          rating anyone earned. */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Rating
        </Text>
        {rating ? (
          <View accessible accessibilityLabel={ratingA11y}>
            <Text
              style={[
                styles.ratingValue,
                NumericFontVariant,
                { color: rating.rated ? colors.primary : colors.text },
              ]}
            >
              {rating.value}
            </Text>
            {rating.rated ? null : (
              <Text
                style={[
                  styles.ratingCaption,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                {rating.caption}
              </Text>
            )}
          </View>
        ) : (
          <InsightError text={INSIGHT_ERROR.rating} onRetry={retryInsights} />
        )}
        {trend ? (
          <Sparkline
            points={trend.points}
            accessibilityLabel={trendAccessibilityLabel(trend.points)}
            emptyText={TREND_EMPTY}
            testID="rating-trend"
          />
        ) : (
          <InsightError text={INSIGHT_ERROR.trend} onRetry={retryInsights} />
        )}
      </View>

      {/* Your moves */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Your moves
        </Text>
        {usage ? (
          <MoveUsageChips usage={usage} emptyText={MOVES_EMPTY} />
        ) : (
          <InsightError text={INSIGHT_ERROR.moves} onRetry={retryInsights} />
        )}
      </View>

      {/* Best prompts: the prompt journal, derived from the player's own
          prompts and round scores. Each row opens the battle it came from. */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Best prompts
        </Text>
        {best === null ? (
          <InsightError
            text={INSIGHT_ERROR.bestPrompts}
            onRetry={retryInsights}
          />
        ) : best.length === 0 ? (
          <Text
            style={[
              styles.emptyHint,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            {BEST_PROMPTS_EMPTY}
          </Text>
        ) : (
          best.map((row, index) => (
            <TouchableOpacity
              key={`${row.battleId}-${row.roundNumber}`}
              onPress={() => router.push(row.route)}
              accessibilityRole="button"
              accessibilityLabel={bestPromptAccessibilityLabel(row)}
              style={[
                styles.promptRow,
                { borderTopColor: colors.border },
                index === 0 && styles.rowFirst,
              ]}
            >
              <View style={styles.promptBody}>
                <Text
                  style={[
                    styles.promptExcerpt,
                    accessibleText,
                    { color: colors.text },
                  ]}
                  numberOfLines={2}
                >
                  “{row.excerpt}”
                </Text>
                <View style={styles.promptMetaRow}>
                  {row.won ? (
                    <Ionicons name="trophy" size={14} color={colors.success} />
                  ) : null}
                  <Text
                    style={[
                      styles.promptMeta,
                      NumericFontVariant,
                      { color: colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {bestPromptMeta(row)}
                  </Text>
                  {row.ko ? (
                    <View
                      style={[styles.koTag, { borderColor: colors.warning }]}
                    >
                      <Text style={[styles.koText, { color: colors.warning }]}>
                        KO
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Recent Battles: the last few with mode and date; the full list lives
          on the Battles tab. */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, accessibleText, { color: colors.text }]}
        >
          Recent Battles
        </Text>
        {recent === null ? (
          <InsightError text={INSIGHT_ERROR.recent} onRetry={retryInsights} />
        ) : recent.length === 0 ? (
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
                styles.emptyHintCentered,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              Your record fills in as you fight. Start one from the Battle
              button.
            </Text>
          </View>
        ) : (
          <>
            {recent.map((row, index) => {
              const color = statusToneColor(row.tone, colors);
              const route = row.route;
              return (
                <TouchableOpacity
                  key={row.id}
                  disabled={!route}
                  onPress={() => {
                    if (route) router.push(route);
                  }}
                  accessibilityRole={route ? 'button' : 'text'}
                  accessibilityLabel={recentBattleAccessibilityLabel(row)}
                  style={[
                    styles.battleRow,
                    { borderTopColor: colors.border },
                    index === 0 && styles.rowFirst,
                  ]}
                >
                  <View style={styles.battleBody}>
                    <Text
                      style={[
                        styles.battleOpponent,
                        accessibleText,
                        { color: colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      vs {row.opponentLabel}
                    </Text>
                    <Text
                      style={[
                        styles.battleMeta,
                        accessibleText,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {row.date
                        ? `${row.modeLabel} · ${row.date}`
                        : row.modeLabel}
                    </Text>
                  </View>
                  <View style={styles.battleTrailing}>
                    <Text style={[styles.battleResult, { color }]}>
                      {row.label}
                    </Text>
                    {route ? (
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.textTertiary}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/battles')}
              accessibilityRole="link"
              accessibilityLabel="See all in Battles. Opens the Battles tab"
              style={[styles.seeAll, { borderTopColor: colors.border }]}
            >
              <Text style={[styles.seeAllText, { color: colors.primary }]}>
                See all in Battles
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>
          </>
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

/** One line and a Retry, in place of a card body whose reads failed. */
function InsightError({
  text,
  onRetry,
}: {
  text: string;
  onRetry: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <View style={styles.insightError}>
      <Text
        style={[
          styles.insightErrorText,
          accessibleText,
          { color: colors.textSecondary },
        ]}
      >
        {text}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={INSIGHT_ERROR.retry}
        style={styles.insightRetry}
      >
        <Text style={[styles.insightRetryText, { color: colors.primary }]}>
          {INSIGHT_ERROR.retry}
        </Text>
      </TouchableOpacity>
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
  ratingCaption: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  insightError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Layout.inputHeight,
  },
  insightErrorText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  insightRetry: {
    minHeight: Layout.inputHeight,
    minWidth: Layout.inputHeight,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  insightRetryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
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
    lineHeight: 20,
  },
  emptyHintCentered: {
    textAlign: 'center',
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Layout.inputHeight,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  promptBody: {
    flex: 1,
    gap: Spacing.xs,
  },
  promptExcerpt: {
    fontSize: Typography.sizes.base,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  promptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  promptMeta: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
  },
  koTag: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  koText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  battleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: Layout.inputHeight,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  battleBody: {
    flex: 1,
    gap: 2,
  },
  battleOpponent: {
    fontSize: Typography.sizes.base,
  },
  battleMeta: {
    fontSize: Typography.sizes.sm,
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
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: Layout.inputHeight,
    marginTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seeAllText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
