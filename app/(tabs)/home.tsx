import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useTabClearance } from '@/hooks/useTabClearance';
import {
  Spacing,
  Typography,
  NumericFontVariant,
  BorderRadius,
} from '@/constants/DesignTokens';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import {
  getActiveBattles,
  arenaBattlePriority,
  describeBattleRow,
  battleRouteFor,
  statusToneColor,
  roundProgressFor,
  roundProgressText,
  roundProgressSpoken,
  opponentProfileIds,
  type BattleListRow,
} from '@/utils/battleLists';
import {
  fetchPublicPlayers,
  type PublicPlayerMap,
} from '@/utils/publicPlayers';
import { opponentIdentityFor } from '@/utils/opponentIdentity';
import {
  fetchHasRatedBattle,
  fetchProfileRow,
  fetchSeasonRank,
} from '@/utils/profileData';
import {
  ratingView,
  seasonEndsLabel,
  type SeasonRankView,
} from '@/utils/profileView';
import { arenaPrimaryActionCopy } from '@/utils/battleCopy';
import { standingLabel, standingRankValue } from '@/utils/rankingsView';
import { resolveSignatureHex } from '@/utils/characters';
import { getWalletBalance, type WalletBalance } from '@/utils/monetization';
import { creditsNoun } from '@/utils/credits';
import { inkFor } from '@/utils/contrast';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import {
  syncDailyMeta,
  claimQuest,
  getFirstTimeOffer,
  dismissFirstTimeOffer,
  DailyMetaState,
  DailyQuest,
  FirstTimeOffer,
} from '@/utils/dailyMeta';
import { useAuth } from '@/providers/AuthProvider';
import HomeFirstTimeOffer from '@/components/HomeFirstTimeOffer';
import {
  StreakMeter,
  SectionCard,
  SubscriberBadge,
  CreditChip,
  InlineBanner,
  Toast,
} from '@/components';
import ArenaFighter from '@/components/game/ArenaFighter';
import { GameAttentionStrip } from '@/components/game/GameAttentionStrip';
import { GameText as Text } from '@/components/game';
import BattleListPortrait from '@/components/BattleListPortrait';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import QuestRow from '@/components/QuestRow';

/** Which of the screen's independent reads a load should run. */
interface LoadParts {
  meta?: boolean;
  battles?: boolean;
  balance?: boolean;
  ftuo?: boolean;
  standing?: boolean;
}

const ALL_PARTS: LoadParts = {
  meta: true,
  battles: true,
  balance: true,
  ftuo: true,
  standing: true,
};
/** Cheap enough to run every time the tab regains focus. */
const FOCUS_PARTS: LoadParts = {
  meta: true,
  battles: true,
  balance: true,
  standing: true,
};
/** What a quest claim can change. */
const CLAIM_PARTS: LoadParts = { meta: true, balance: true };
const BATTLES_PART: LoadParts = { battles: true };
const STANDING_PART: LoadParts = { standing: true };

interface SectionErrors {
  meta: boolean;
  battles: boolean;
  balance: boolean;
  standing: boolean;
}

const NO_ERRORS: SectionErrors = {
  meta: false,
  battles: false,
  balance: false,
  standing: false,
};

/** What the "Your standing" card says; all three reads must have succeeded. */
interface StandingState {
  rank: SeasonRankView;
  rating: number | null;
  hasRatedBattle: boolean;
}

/**
 * Season rank, rating and rated-ness in one read. Any failure is the card's
 * failure: a missing rankings row must not print "Unranked" as a fact.
 */
async function fetchStanding(userId: string): Promise<StandingState | null> {
  const [rank, hasRatedBattle, profile] = await Promise.all([
    fetchSeasonRank(userId),
    fetchHasRatedBattle(userId),
    fetchProfileRow(userId),
  ]);
  if (!rank || hasRatedBattle === null || !profile) return null;
  return { rank, rating: profile.rating, hasRatedBattle };
}

/** A focus that lands right after the mount fetch must not fetch again. */
const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const TOAST_MS = 2500;
const ACTIVE_BATTLE_LIMIT = 10;

/** Sentinel for a read this load did not ask for. */
const SKIPPED = Promise.resolve(undefined);

export default function HomeScreen() {
  const presentationActive = useBattlePresentationActive();
  const offerReturnFocusRef = useRef<View>(null);
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const tabClearance = useTabClearance();
  const { user } = useAuth();
  const userId = user?.id;

  const [meta, setMeta] = useState<DailyMetaState | null>(null);
  const [activeBattles, setActiveBattles] = useState<BattleListRow[]>([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [publicPlayers, setPublicPlayers] = useState<PublicPlayerMap>(
    () => new Map(),
  );
  const [standing, setStanding] = useState<StandingState | null>(null);
  const [errors, setErrors] = useState<SectionErrors>(NO_ERRORS);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fighterRefresh, setFighterRefresh] = useState(0);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [ftuo, setFtuo] = useState<FirstTimeOffer | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const lastLoadRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  /**
   * Each section loads and fails on its own. A single rejected call used to
   * throw out of `Promise.all` and leave the whole screen on last render.
   */
  const load = useCallback(
    async (parts: LoadParts) => {
      lastLoadRef.current = Date.now();
      const [metaRes, battlesRes, balanceRes, ftuoRes, standingRes] =
        await Promise.allSettled([
          parts.meta ? syncDailyMeta() : SKIPPED,
          parts.battles ? getActiveBattles(ACTIVE_BATTLE_LIMIT) : SKIPPED,
          parts.balance ? getWalletBalance() : SKIPPED,
          parts.ftuo ? getFirstTimeOffer() : SKIPPED,
          parts.standing && userId ? fetchStanding(userId) : SKIPPED,
        ]);

      const next: Partial<SectionErrors> = {};

      if (parts.meta) {
        // syncDailyMeta reports failure as null rather than throwing.
        if (metaRes.status === 'fulfilled' && metaRes.value) {
          setMeta(metaRes.value);
          next.meta = false;
        } else {
          if (metaRes.status === 'rejected')
            console.error('Failed to sync daily meta:', metaRes.reason);
          next.meta = true;
        }
      }

      if (parts.battles) {
        if (battlesRes.status === 'fulfilled' && battlesRes.value) {
          const rows = battlesRes.value;
          // Human opponents' archetype and colour from the public view, in one
          // read that never rejects; unknown players stay the neutral art.
          const players = await fetchPublicPlayers(
            opponentProfileIds(rows, userId),
          );
          setActiveBattles(rows);
          setPublicPlayers(players);
          next.battles = false;
        } else {
          if (battlesRes.status === 'rejected')
            console.error('Failed to load active battles:', battlesRes.reason);
          next.battles = true;
        }
      }

      if (parts.balance) {
        if (balanceRes.status === 'fulfilled' && balanceRes.value) {
          setBalance(balanceRes.value);
          next.balance = false;
        } else {
          next.balance = true;
        }
      }

      if (parts.ftuo && ftuoRes.status === 'fulfilled') {
        const offer = ftuoRes.value as FirstTimeOffer | null | undefined;
        setFtuo(offer ?? null);
      }

      if (parts.standing && userId) {
        // fetchStanding reports failure as null rather than throwing.
        if (standingRes.status === 'fulfilled' && standingRes.value) {
          setStanding(standingRes.value);
          next.standing = false;
        } else {
          if (standingRes.status === 'rejected')
            console.error('Failed to load standing:', standingRes.reason);
          next.standing = true;
        }
      }

      setErrors((prev) => ({ ...prev, ...next }));
      setIsLoading(false);
      setRefreshing(false);
    },
    [userId],
  );

  // The first focus is the mount; later focuses only refresh what changes
  // while the player is away (a battle resolving, a quest ticking over).
  useFocusEffect(
    useCallback(() => {
      if (lastLoadRef.current === 0) {
        void load(ALL_PARTS);
        return;
      }
      if (Date.now() - lastLoadRef.current < FOCUS_REFETCH_DEBOUNCE_MS) return;
      void load(FOCUS_PARTS);
    }, [load]),
  );

  const onRefresh = () => {
    setFighterRefresh((value) => value + 1);
    setRefreshing(true);
    void load(ALL_PARTS);
  };

  const handleClaimQuest = async (quest: DailyQuest) => {
    const reward = quest.quest?.reward_credits ?? 0;
    setClaimingQuestId(quest.daily_quest_id);
    try {
      const result = await claimQuest(quest.daily_quest_id);
      if (result.success) {
        hapticSuccess();
        const granted = result.credits_granted ?? reward;
        showToast(
          granted > 0
            ? `+${creditsNoun(granted)} claimed`
            : 'Quest reward claimed',
        );
      } else {
        // The server's reason is developer prose ("Quest not eligible or
        // already completed"); the refetch below corrects the row instead.
        hapticError();
        showToast('Couldn’t claim the reward. Try again.');
      }
    } finally {
      setClaimingQuestId(null);
    }
    await load(CLAIM_PARTS);
  };

  // Only drop the modal once the server agrees: clearing it locally first
  // brought the offer straight back on the next load when the call failed.
  const handleDismissFtuo = async () => {
    const ok = await dismissFirstTimeOffer();
    if (ok) {
      setFtuo(null);
      return;
    }
    Alert.alert(
      'Couldn’t dismiss the offer',
      'Check your connection and try again.',
    );
  };

  const quests = meta?.quests ?? [];
  const completedQuests = quests.filter(
    (q) =>
      q.completed ||
      Boolean(q.quest && q.current_value >= q.quest.target_value),
  ).length;

  const arenaBattles = useMemo(
    () => arenaBattlePriority(activeBattles, user?.id),
    [activeBattles, user?.id],
  );
  const urgentBattle = arenaBattles.primary;
  const otherBattles = arenaBattles.remaining;
  const urgentCopy = urgentBattle
    ? arenaPrimaryActionCopy(
        describeBattleRow(urgentBattle, user?.id).status.label,
        urgentBattle.theme,
      )
    : null;
  const otherYourTurnCount = useMemo(
    () =>
      otherBattles.filter(
        (b) => describeBattleRow(b, user?.id).status.label === 'Your turn',
      ).length,
    [otherBattles, user?.id],
  );

  const primaryInk = inkFor(colors.primary);

  // "Your standing": rank or Unranked, rating or Unrated, and the season line.
  const standingRating = ratingView({
    rating: standing?.rating ?? null,
    hasRatedBattle: standing?.hasRatedBattle ?? false,
  });
  const standingSeason = standing
    ? [standing.rank.seasonName, seasonEndsLabel(standing.rank.endsAt)]
        .filter(Boolean)
        .join(' · ') || null
    : null;
  const standingA11y = standingLabel({
    rank: standing?.rank.rank ?? null,
    rated: standingRating.rated,
    ratingValue: standingRating.value,
  });

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background },
          styles.centered,
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.sm,
            paddingBottom: tabClearance + Spacing.lg,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <ArenaFighter
          account={userId}
          refreshVersion={fighterRefresh}
          mastheadTrailing={
            <>
              {balance?.is_subscriber ? <SubscriberBadge /> : null}
              <CreditChip
                focusRef={offerReturnFocusRef}
                credits={balance?.credits_balance ?? 0}
                unavailable={errors.balance && !balance}
              />
            </>
          }
          beforeHero={
            urgentBattle && urgentCopy ? (
              <GameAttentionStrip
                {...urgentCopy}
                onPress={() => {
                  const route = battleRouteFor(urgentBattle, userId);
                  if (route) router.push(route);
                }}
              />
            ) : undefined
          }
        />

        {errors.battles ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="error"
              text="Couldn’t load your active battles."
              actionLabel="Retry"
              onAction={() => void load(BATTLES_PART)}
            />
          </View>
        ) : otherBattles.length > 0 ? (
          <SectionCard
            title={urgentBattle ? 'Other Battles' : 'Active Battles'}
            trailing={
              otherYourTurnCount > 0 ? (
                <Text
                  style={[
                    styles.countPill,
                    NumericFontVariant,
                    { backgroundColor: colors.primary, color: primaryInk },
                  ]}
                >
                  {otherYourTurnCount} your turn
                </Text>
              ) : undefined
            }
          >
            {otherBattles.map((battle, index) => {
              const view = describeBattleRow(battle, userId);
              const route = battleRouteFor(battle, userId);
              const toneColor = statusToneColor(view.status.tone, colors);
              const identity = opponentIdentityFor(
                battle,
                userId,
                publicPlayers,
              );
              const name = identity.name ?? view.opponentName;
              // Bots keep the neutral illustration and a plain ring.
              const art =
                archetypeIllustrationUri(
                  identity.isBot ? null : identity.archetype,
                ) ?? '';
              const ring =
                !identity.isBot && identity.signatureColor
                  ? resolveSignatureHex(identity.signatureColor)
                  : colors.border;
              const progress = roundProgressFor(battle, userId);
              const isLast = index === otherBattles.length - 1;
              const label = [
                `${view.status.label}.`,
                `Battle against ${name}.`,
                progress ? roundProgressSpoken(progress) : null,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <TouchableOpacity
                  key={battle.id}
                  style={[
                    styles.battleItem,
                    { borderBottomColor: colors.borderLight },
                    isLast && styles.lastItem,
                  ]}
                  onPress={() => {
                    if (route) router.push(route);
                  }}
                  disabled={!route}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled: !route }}
                >
                  <BattleListPortrait
                    accountId={userId}
                    battleId={battle.id}
                    side={
                      battle.player_two_id === userId
                        ? 'player_one'
                        : 'player_two'
                    }
                    snapshot={battle.identity_snapshot}
                    visible={presentationActive}
                    fallbackUri={art}
                    size={40}
                    accentColor={ring}
                    name={name}
                  />
                  <View style={styles.battleInfo}>
                    <Text
                      variant="label"
                      style={[
                        styles.battleOpponent,
                        accessibleText,
                        { color: colors.text },
                      ]}
                    >
                      vs {name}
                    </Text>
                    {progress ? (
                      <Text
                        style={[
                          styles.battleProgress,
                          NumericFontVariant,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {roundProgressText(progress)}
                      </Text>
                    ) : null}
                    <View style={styles.battleStatusRow}>
                      {/* Shape + colour: the dot marks "needs you" for colour-blind players. */}
                      {view.status.actionable ? (
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: toneColor },
                          ]}
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.battleStatus,
                          accessibleText,
                          {
                            color: toneColor,
                            fontWeight: view.status.actionable
                              ? Typography.weights.semibold
                              : Typography.weights.regular,
                          },
                        ]}
                      >
                        {view.status.label}
                      </Text>
                      {battle.theme ? (
                        <Text
                          style={[
                            styles.battleTheme,
                            { color: colors.textTertiary },
                          ]}
                        >
                          {' '}
                          · {battle.theme}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <GameSymbol
                    name="chevron-forward"
                    size={16}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              );
            })}
          </SectionCard>
        ) : null}

        {errors.meta ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="error"
              text="Couldn’t load your streak and quests."
              actionLabel="Retry"
              onAction={() => void load(CLAIM_PARTS)}
            />
          </View>
        ) : null}

        {/* Daily Quests — the whole day's list (three small tasks), never a slice. */}
        {meta ? (
          <SectionCard
            title="Daily Quests"
            subtitle={
              quests.length > 0
                ? `${completedQuests} of ${quests.length} complete`
                : undefined
            }
          >
            {quests.length === 0 ? (
              <Text
                style={[
                  styles.emptyText,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                No quests today. Check back tomorrow.
              </Text>
            ) : (
              quests.map((quest, index) => (
                <QuestRow
                  key={quest.id}
                  quest={quest}
                  claiming={claimingQuestId === quest.daily_quest_id}
                  onClaim={(q) => void handleClaimQuest(q)}
                  isLast={index === quests.length - 1}
                />
              ))
            )}
          </SectionCard>
        ) : null}

        {/* Streak meter */}
        {meta ? (
          <StreakMeter
            loginStreak={meta.login.streak}
            claimedToday={meta.login.claimed_today}
            winStreak={meta.win_streak.current}
            bestStreak={meta.win_streak.best}
          />
        ) : null}

        {/* Your standing — the rankings teaser (audit A3). The whole card is
            the button; a failed read says so instead of printing "Unranked". */}
        {errors.standing ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="error"
              text="Couldn’t load your standing."
              actionLabel="Retry"
              onAction={() => void load(STANDING_PART)}
            />
          </View>
        ) : standing ? (
          <Pressable
            style={({ pressed }) => [
              styles.standingPress,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/(tabs)/rankings')}
            accessibilityRole="button"
            accessibilityLabel={standingA11y}
          >
            <SectionCard
              title="Your standing"
              style={styles.standingCard}
              trailing={
                <GameSymbol
                  name="chevron-forward"
                  size={16}
                  color={colors.textSecondary}
                />
              }
            >
              <View style={styles.standingColumns}>
                <View style={styles.standingCol}>
                  <Text
                    style={[
                      styles.standingLabel,
                      accessibleText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Season rank
                  </Text>
                  <Text
                    style={[
                      styles.standingValue,
                      NumericFontVariant,
                      { color: colors.text },
                    ]}
                  >
                    {standingRankValue(standing.rank.rank)}
                  </Text>
                </View>
                <View style={styles.standingCol}>
                  <Text
                    style={[
                      styles.standingLabel,
                      accessibleText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Rating
                  </Text>
                  <Text
                    style={[
                      styles.standingValue,
                      NumericFontVariant,
                      { color: colors.text },
                    ]}
                  >
                    {standingRating.value}
                  </Text>
                </View>
              </View>
              {standingSeason ? (
                <Text
                  style={[
                    styles.standingSeason,
                    accessibleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {standingSeason}
                </Text>
              ) : null}
            </SectionCard>
          </Pressable>
        ) : null}

        <HomeFirstTimeOffer
          returnFocusRef={offerReturnFocusRef}
          key={userId}
          state={ftuo}
          onSettled={() => load(ALL_PARTS)}
          onDismiss={handleDismissFtuo}
        />
      </ScrollView>

      {toast ? <Toast text={toast} /> : null}
    </View>
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
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTrailing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
  },
  bannerWrap: {
    marginBottom: Spacing.md,
  },
  urgentAction: {
    minHeight: 96,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  urgentCopy: {
    flex: 1,
  },
  urgentEyebrow: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    marginBottom: 2,
  },
  urgentTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  urgentSubtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
    opacity: 0.82,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  countPill: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: Typography.sizes.base,
  },
  battleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  battleInfo: {
    flex: 1,
  },
  battleOpponent: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: 2,
  },
  battleProgress: {
    fontSize: Typography.sizes.sm,
    marginBottom: 2,
  },
  battleStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
  },
  battleStatus: {
    fontSize: Typography.sizes.sm,
  },
  battleTheme: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
  },
  standingPress: {
    marginBottom: Spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  standingCard: {
    marginBottom: 0,
  },
  standingColumns: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  standingCol: {
    flex: 1,
  },
  standingLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  standingValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  standingSeason: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
  },
});
