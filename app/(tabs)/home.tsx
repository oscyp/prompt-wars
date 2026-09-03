import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useTabClearance } from '@/hooks/useTabClearance';
import {
  Spacing,
  Typography,
  NumericFontVariant,
  Elevation,
  BorderRadius,
  Scrim,
  Ink,
} from '@/constants/DesignTokens';
import { accentForTheme, posterForTheme } from '@/constants/ThemeArt';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { getDailyTheme } from '@/utils/battles';
import {
  getActiveBattles,
  sortBattlesForList,
  describeBattleRow,
  battleRouteFor,
  statusToneColor,
  type BattleListRow,
} from '@/utils/battleLists';
import { getWalletBalance, type WalletBalance } from '@/utils/monetization';
import { creditsNoun } from '@/utils/credits';
import { inkFor } from '@/utils/contrast';
import { hapticError, hapticSelection, hapticSuccess } from '@/utils/haptics';
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
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import {
  findPackageForProduct,
  offerPriceStrings,
} from '@/utils/storePackages';
import {
  StreakMeter,
  FirstTimeOfferModal,
  SectionCard,
  SubscriberBadge,
  CreditChip,
  InlineBanner,
  Toast,
} from '@/components';
import { useBattleSheet } from '@/components/BattleModeSheet';

interface DailyThemeRow {
  theme_text: string;
}

/** Which of the screen's independent reads a load should run. */
interface LoadParts {
  theme?: boolean;
  meta?: boolean;
  battles?: boolean;
  balance?: boolean;
  ftuo?: boolean;
}

const ALL_PARTS: LoadParts = {
  theme: true,
  meta: true,
  battles: true,
  balance: true,
  ftuo: true,
};
/** Cheap enough to run every time the tab regains focus. */
const FOCUS_PARTS: LoadParts = { meta: true, battles: true, balance: true };
/** What a quest claim can change. */
const CLAIM_PARTS: LoadParts = { meta: true, balance: true };
const THEME_PART: LoadParts = { theme: true };

interface SectionErrors {
  theme: boolean;
  meta: boolean;
  battles: boolean;
  balance: boolean;
}

const NO_ERRORS: SectionErrors = {
  theme: false,
  meta: false,
  battles: false,
  balance: false,
};

/** A focus that lands right after the mount fetch must not fetch again. */
const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const TOAST_MS = 2500;
const ACTIVE_BATTLE_LIMIT = 10;

/** Sentinel for a read this load did not ask for. */
const SKIPPED = Promise.resolve(undefined);

export default function HomeScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const tabClearance = useTabClearance();
  const { user } = useAuth();
  const { offerings, purchasePackage } = useRevenueCat();
  const battleSheet = useBattleSheet();

  const [dailyTheme, setDailyTheme] = useState<DailyThemeRow | null>(null);
  const [meta, setMeta] = useState<DailyMetaState | null>(null);
  const [activeBattles, setActiveBattles] = useState<BattleListRow[]>([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [errors, setErrors] = useState<SectionErrors>(NO_ERRORS);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const load = useCallback(async (parts: LoadParts) => {
    lastLoadRef.current = Date.now();
    const [themeRes, metaRes, battlesRes, balanceRes, ftuoRes] =
      await Promise.allSettled([
        parts.theme ? getDailyTheme() : SKIPPED,
        parts.meta ? syncDailyMeta() : SKIPPED,
        parts.battles ? getActiveBattles(ACTIVE_BATTLE_LIMIT) : SKIPPED,
        parts.balance ? getWalletBalance() : SKIPPED,
        parts.ftuo ? getFirstTimeOffer() : SKIPPED,
      ]);

    const next: Partial<SectionErrors> = {};

    if (parts.theme) {
      if (themeRes.status === 'fulfilled') {
        setDailyTheme(
          (themeRes.value as DailyThemeRow | null | undefined) ?? null,
        );
        next.theme = false;
      } else {
        console.error('Failed to load daily theme:', themeRes.reason);
        next.theme = true;
      }
    }

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
        setActiveBattles(battlesRes.value);
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
      setFtuo(offer && offer.eligible ? offer : null);
    }

    setErrors((prev) => ({ ...prev, ...next }));
    setIsLoading(false);
    setRefreshing(false);
  }, []);

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
    setRefreshing(true);
    void load(ALL_PARTS);
  };

  const openBattleSheet = () => {
    hapticSelection();
    battleSheet.open();
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

  // The store package behind the offer, when RevenueCat has it. It supplies
  // the localized price the modal shows and is what the claim purchases.
  const ftuoProductId = ftuo?.offer?.product_id;
  const ftuoPackage = useMemo(
    () => findPackageForProduct(offerings, ftuoProductId),
    [offerings, ftuoProductId],
  );
  const ftuoPrices = useMemo(
    () => offerPriceStrings(ftuoPackage),
    [ftuoPackage],
  );

  const handleClaimFtuo = async (): Promise<boolean> => {
    if (!ftuoProductId) return false;
    if (!ftuoPackage) {
      console.warn('FTUO package not found in offerings:', ftuoProductId);
      return false;
    }
    const ok = await purchasePackage(ftuoPackage);
    if (ok) await load(ALL_PARTS);
    return ok;
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
  const completedQuests = quests.filter((q) => q.completed).length;

  const sortedBattles = useMemo(
    () => sortBattlesForList(activeBattles, user?.id),
    [activeBattles, user?.id],
  );
  const yourTurnCount = useMemo(
    () =>
      sortedBattles.filter(
        (b) => describeBattleRow(b, user?.id).status.label === 'Your turn',
      ).length,
    [sortedBattles, user?.id],
  );

  const primaryInk = inkFor(colors.primary);
  const heroAccent = accentForTheme(dailyTheme?.theme_text);

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
        {/* Header: screen identity + credits chip (always present; a failed
            balance read shows as unavailable rather than as zero). */}
        <View style={styles.headerRow}>
          <Text
            style={[styles.title, { color: colors.text }]}
            accessibilityRole="header"
          >
            Arena
          </Text>
          <View style={styles.headerTrailing}>
            {balance?.is_subscriber ? <SubscriberBadge /> : null}
            <CreditChip
              credits={balance?.credits_balance ?? 0}
              unavailable={errors.balance && !balance}
            />
          </View>
        </View>

        {errors.theme ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="error"
              text="Couldn’t load today’s theme."
              actionLabel="Retry"
              onAction={() => void load(THEME_PART)}
            />
          </View>
        ) : null}

        {/* Daily theme hero poster — tap to battle on today's theme */}
        <Pressable
          style={[styles.heroWrap, Elevation.md]}
          onPress={openBattleSheet}
          accessibilityRole="button"
          accessibilityLabel={
            dailyTheme
              ? `Today's theme: ${dailyTheme.theme_text}. Start a battle`
              : 'Start a battle'
          }
        >
          <ImageBackground
            source={posterForTheme(dailyTheme?.theme_text)}
            style={styles.hero}
            imageStyle={styles.heroImage}
            resizeMode="cover"
          >
            {/* Deterministic per-theme accent wash under the dark scrim: shifts the
                poster hue per daily theme while the scrim on top preserves AA. */}
            <View
              style={[styles.heroAccent, { backgroundColor: heroAccent }]}
            />
            {/* Scrim guarantees AA for the overlay text on the illustration. */}
            <View style={styles.heroScrim} />
            <View style={styles.heroContent}>
              <View
                style={[styles.heroKeyline, { backgroundColor: heroAccent }]}
              />
              <Text style={styles.heroLabel}>TODAY&apos;S THEME</Text>
              <Text style={styles.heroTheme} numberOfLines={2}>
                {dailyTheme?.theme_text ?? 'Open Arena'}
              </Text>
              <View style={styles.heroCta}>
                <MaterialCommunityIcons
                  name="sword-cross"
                  size={14}
                  color={Ink.onAccentLight}
                />
                <Text style={styles.heroCtaText}>Battle now</Text>
              </View>
            </View>
          </ImageBackground>
        </Pressable>

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

        {/* Streak meter */}
        {meta ? (
          <StreakMeter
            loginStreak={meta.login.streak}
            claimedToday={meta.login.claimed_today}
            winStreak={meta.win_streak.current}
            bestStreak={meta.win_streak.best}
          />
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
              quests.map((quest, index) => {
                const target = quest.quest?.target_value || 1;
                const value = quest.current_value || 0;
                const reward = quest.quest?.reward_credits ?? 0;
                const claimable = !quest.completed && value >= target;
                const claiming = claimingQuestId === quest.daily_quest_id;
                const isLast = index === quests.length - 1;
                return (
                  <View
                    key={quest.id}
                    style={[
                      styles.questItem,
                      { borderBottomColor: colors.borderLight },
                      isLast && styles.lastItem,
                    ]}
                  >
                    <Text
                      style={[
                        styles.questText,
                        accessibleText,
                        { color: colors.text },
                      ]}
                    >
                      {quest.quest?.description ||
                        quest.quest?.title ||
                        'Quest'}
                    </Text>
                    <View style={styles.questProgress}>
                      {quest.completed ? (
                        <View style={styles.questStatusRow}>
                          <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color={colors.success}
                          />
                          <Text
                            style={[
                              styles.questStatus,
                              { color: colors.success },
                            ]}
                          >
                            Complete
                          </Text>
                        </View>
                      ) : (
                        <Text
                          style={[
                            styles.questStatus,
                            NumericFontVariant,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {value}/{target}
                        </Text>
                      )}
                      {claimable ? (
                        <TouchableOpacity
                          style={[
                            styles.claimQuestButton,
                            { backgroundColor: colors.primary },
                          ]}
                          onPress={() => void handleClaimQuest(quest)}
                          disabled={claiming}
                          accessibilityRole="button"
                          accessibilityLabel={`Claim ${creditsNoun(reward)}`}
                          accessibilityState={{
                            disabled: claiming,
                            busy: claiming,
                          }}
                        >
                          {claiming ? (
                            <ActivityIndicator
                              size="small"
                              color={primaryInk}
                            />
                          ) : (
                            <Text
                              style={[
                                styles.claimQuestText,
                                NumericFontVariant,
                                { color: primaryInk },
                              ]}
                            >
                              Claim +{reward}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ) : !quest.completed && reward > 0 ? (
                        <Text
                          style={[
                            styles.questReward,
                            NumericFontVariant,
                            { color: colors.primary },
                          ]}
                        >
                          +{creditsNoun(reward)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </SectionCard>
        ) : null}

        {errors.battles ? (
          <View style={styles.bannerWrap}>
            <InlineBanner
              tone="error"
              text="Couldn’t load your active battles."
              actionLabel="Retry"
              onAction={() => void load({ battles: true })}
            />
          </View>
        ) : (
          <SectionCard
            title="Active Battles"
            trailing={
              yourTurnCount > 0 ? (
                <Text
                  style={[
                    styles.countPill,
                    NumericFontVariant,
                    { backgroundColor: colors.primary, color: primaryInk },
                  ]}
                >
                  {yourTurnCount} your turn
                </Text>
              ) : undefined
            }
          >
            {sortedBattles.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text
                  style={[
                    styles.emptyText,
                    accessibleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  No battles in progress
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { borderColor: colors.primary }]}
                  onPress={openBattleSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Start a battle"
                >
                  <Text
                    style={[styles.emptyCtaText, { color: colors.primary }]}
                  >
                    Start a battle
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              sortedBattles.map((battle, index) => {
                const view = describeBattleRow(battle, user?.id);
                const route = battleRouteFor(battle, user?.id);
                const toneColor = statusToneColor(view.status.tone, colors);
                const isLast = index === sortedBattles.length - 1;
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
                    accessibilityLabel={`${view.status.label}. Battle against ${view.opponentName}`}
                    accessibilityState={{ disabled: !route }}
                  >
                    <Image
                      source={getArchetypeAvatar(null)}
                      style={styles.battleAvatar}
                      resizeMode="cover"
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                    <View style={styles.battleInfo}>
                      <Text
                        style={[
                          styles.battleOpponent,
                          accessibleText,
                          { color: colors.text },
                        ]}
                        numberOfLines={1}
                      >
                        vs {view.opponentName}
                      </Text>
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
                            numberOfLines={1}
                          >
                            {' '}
                            · {battle.theme}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })
            )}
          </SectionCard>
        )}

        {/* Call to Action */}
        <TouchableOpacity
          style={[styles.ctaButton, { backgroundColor: colors.primary }]}
          onPress={openBattleSheet}
          accessibilityLabel="Start a new battle"
          accessibilityRole="button"
        >
          <View style={styles.buttonInner}>
            <MaterialCommunityIcons
              name="sword-cross"
              size={22}
              color={primaryInk}
            />
            <Text style={[styles.ctaButtonText, { color: primaryInk }]}>
              Start Battle
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shopButton, { borderColor: colors.primary }]}
          onPress={() => router.push('/(profile)/shop')}
          accessibilityLabel="Open cosmetic shop"
          accessibilityRole="button"
        >
          <View style={styles.buttonInner}>
            <Ionicons
              name="color-palette-outline"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.shopButtonText, { color: colors.primary }]}>
              Cosmetic Shop
            </Text>
          </View>
        </TouchableOpacity>

        <FirstTimeOfferModal
          visible={!!ftuo?.eligible}
          offer={ftuo?.offer}
          expiresAt={ftuo?.expires_at}
          priceString={ftuoPrices.priceString}
          referencePriceString={ftuoPrices.referencePriceString}
          onClaim={handleClaimFtuo}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTrailing: {
    flexDirection: 'row',
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
  heroWrap: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  hero: {
    aspectRatio: 16 / 9,
    justifyContent: 'flex-end',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  heroImage: {
    borderRadius: BorderRadius.lg,
  },
  heroAccent: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  // Fixed-dark cinematic surface (design language §3): a flat near-black wash
  // over artwork, deliberately not a themed colour.
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 11, 15, 0.35)',
  },
  heroContent: {
    padding: Spacing.md,
  },
  heroKeyline: {
    width: 28,
    height: 3,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  heroLabel: {
    color: Ink.onAccentLight,
    opacity: 0.85,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  heroTheme: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.sm,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: Scrim.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  heroCtaText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  questItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  lastItem: {
    borderBottomWidth: 0,
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
  questStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  questReward: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  claimQuestButton: {
    // 44pt: the design language's minimum target, met by the visible control.
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimQuestText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  countPill: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  emptyBlock: {
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.sizes.base,
  },
  emptyCta: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  battleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  battleAvatar: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
  },
  battleInfo: {
    flex: 1,
  },
  battleOpponent: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
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
  ctaButton: {
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
    ...Elevation.md,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  ctaButtonText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  shopButton: {
    height: 52,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  shopButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
