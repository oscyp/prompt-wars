import PracticeReplayButton from '@/components/PracticeReplayButton';
import PlayerSafetyActions from '@/components/PlayerSafetyActions';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  GameText as Text,
  GameButton,
  GameHeader,
  GamePanel,
  GameNavRow,
} from '@/components/game';
import BrandMark from '@/components/game/BrandMark';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameIconName } from '@/components/game/icons/GameIcon';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useTabClearance } from '@/hooks/useTabClearance';
import { BorderRadius, Spacing, Typography } from '@/constants/DesignTokens';
import { getRivals } from '@/utils/battles';
import { loadPortraitRef, resolveSignatureHex } from '@/utils/characters';
import { listCosmetics, type CosmeticItem } from '@/utils/cosmetics';
import { syncDailyMeta } from '@/utils/dailyMeta';
import { hapticSelection } from '@/utils/haptics';
import { shareResultCard } from '@/utils/share';
import { resolveEquippedCosmetics } from '@/utils/cosmetics';
import {
  buildRivalViews,
  fetchActiveCharacter,
  fetchHasRatedBattle,
  fetchProfileRow,
  fetchRivalBattles,
  fetchSeasonRank,
  fetchSignatureItemName,
  type ActiveCharacterRow,
  type ProfileRow,
  type RivalView,
} from '@/utils/profileData';
import {
  PROFILE_ERROR_COPY,
  nextUnlock,
  progressionRows,
  ratingView,
  type SeasonRankView,
} from '@/utils/profileView';
import {
  FighterHero,
  ProfileSkeleton,
  ProgressionStrip,
  RivalRow,
  joinedLabel,
  type ProgressionRoute,
} from '@/components/profile';

const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const RIVALS_LIMIT = 5;

interface ProfileData {
  profile: ProfileRow | null;
  character: ActiveCharacterRow | null;
  /** Full-body render, then the avatar, then nothing (archetype art). */
  renderUri: string | null;
  itemName: string | null;
  hasRatedBattle: boolean | null;
  seasonRank: SeasonRankView | null;
  cosmeticItems: CosmeticItem[] | null;
  loginStreak: number | null;
  rivals: RivalView[];
  errors: { hero: boolean; progression: boolean; rivals: boolean };
}

/** Unwraps a settled promise, logging rejections; fetchers rarely reject. */
function settled<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  what: string,
): T {
  if (result.status === 'fulfilled') return result.value;
  console.error(`Profile load failed (${what}):`, result.reason);
  return fallback;
}

interface ActionPillProps {
  gameIcon: GameIconName;
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}

function ActionPill({
  gameIcon,
  label,
  onPress,
  busy = false,
  disabled = false,
}: ActionPillProps) {
  return (
    <GameButton
      gameIcon={gameIcon}
      label={label}
      busy={busy}
      disabled={disabled}
      tone="secondary"
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={{ flexGrow: 1 }}
    />
  );
}

function ProfileErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <GamePanel style={{ gap: 12 }}>
      <Text variant="title" accessibilityRole="header">
        {PROFILE_ERROR_COPY.title}
      </Text>
      <Text>{PROFILE_ERROR_COPY.body}</Text>
      <GameButton label={PROFILE_ERROR_COPY.retry} onPress={onRetry} />
    </GamePanel>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const tabClearance = useTabClearance();
  const { user } = useAuth();
  const userId = user?.id;

  const [data, setData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const heroRef = useRef<View>(null);
  const lastLoadRef = useRef(0);
  // Each load gets a sequence number so a slow, late-arriving item name from
  // an earlier load cannot overwrite a newer one.
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    lastLoadRef.current = Date.now();
    const seq = ++loadSeqRef.current;
    if (!userId) {
      // Returning before the finally used to leave the spinner up for good.
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [
        profileRes,
        characterRes,
        ratedRes,
        seasonRes,
        cosmeticsRes,
        dailyRes,
        rivalsRes,
      ] = await Promise.allSettled([
        fetchProfileRow(userId),
        fetchActiveCharacter(userId),
        fetchHasRatedBattle(userId),
        fetchSeasonRank(userId),
        listCosmetics(),
        // Idempotent per day; the Arena calls it on focus too. It is the only
        // client-readable source of the login streak.
        syncDailyMeta(),
        getRivals(RIVALS_LIMIT),
      ]);

      const profile = settled(profileRes, null, 'profile');
      const character = settled(characterRes, null, 'character');
      const hasRatedBattle = settled(ratedRes, null, 'rated flag');
      const seasonRank = settled(seasonRes, null, 'season rank');
      const catalog = settled(cosmeticsRes, null, 'cosmetics');
      const daily = settled(dailyRes, null, 'daily meta');
      const rivalSummaries = settled(rivalsRes, null, 'rivals');

      // Second wave: everything that needs the first wave's ids. Render and
      // avatar are signed in parallel; the avatar is only a fallback for a
      // character without a full-body render.
      const renderId = character?.portrait_id ?? null;
      const avatarId =
        character?.avatar_portrait_id &&
        character.avatar_portrait_id !== renderId
          ? character.avatar_portrait_id
          : null;
      const [renderRes, avatarRes, battlesRes] = await Promise.allSettled([
        renderId ? loadPortraitRef(renderId) : Promise.resolve(null),
        avatarId ? loadPortraitRef(avatarId) : Promise.resolve(null),
        rivalSummaries
          ? fetchRivalBattles(
              userId,
              rivalSummaries.map((r) => r.rivalProfileId),
            )
          : Promise.resolve(null),
      ]);
      const render = settled(renderRes, null, 'render');
      const avatar = settled(avatarRes, null, 'avatar');
      const rivalBattles = settled(battlesRes, null, 'rival battles');

      // The item name comes from an Edge Function that can cold-start for
      // seconds. It is one word on the hero's subtitle, so it fills in when
      // it arrives instead of holding the whole screen on the skeleton.
      const itemId = character?.signature_item_id ?? null;
      const itemName: string | null = null;
      if (itemId) {
        void fetchSignatureItemName(itemId).then((name) => {
          if (!name || loadSeqRef.current !== seq) return;
          setData((prev) =>
            prev && prev.character?.signature_item_id === itemId
              ? { ...prev, itemName: name }
              : prev,
          );
        });
      }

      setData({
        profile,
        character,
        renderUri: render?.url ?? avatar?.url ?? null,
        itemName,
        hasRatedBattle,
        seasonRank,
        cosmeticItems: catalog?.items ?? null,
        loginStreak: daily?.login.streak ?? null,
        rivals:
          rivalSummaries && rivalBattles
            ? buildRivalViews(rivalSummaries, rivalBattles, userId)
            : [],
        errors: {
          hero: !profile || !character,
          // Streaks come from the profile; a null flag or rank means that
          // read failed, and "Unrated"/"Unranked" would then be a guess.
          progression:
            !profile || hasRatedBattle === null || seasonRank === null,
          rivals: rivalSummaries === null || rivalBattles === null,
        },
      });
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (lastLoadRef.current === 0) {
        void load();
        return;
      }
      if (Date.now() - lastLoadRef.current < FOCUS_REFETCH_DEBOUNCE_MS) return;
      void load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  // The hero's Retry starts over with the skeleton; section retries keep the
  // rest of the screen and show progress through the refresh control.
  const retryAll = () => {
    setIsLoading(true);
    void load();
  };
  const retrySection = () => {
    setRefreshing(true);
    void load();
  };

  const openEditCharacter = () => router.push('/(profile)/edit-character');
  const openShop = () => router.push('/(profile)/shop');
  const navigate = (route: ProgressionRoute) => router.push(route);

  const handleShareCard = async () => {
    setIsSharing(true);
    try {
      const shared = await shareResultCard(heroRef);
      if (!shared) {
        Alert.alert(
          'Sharing unavailable',
          'Sharing is not available on this device.',
        );
      }
    } catch {
      Alert.alert('Couldn’t share', 'The fighter card could not be shared.');
    } finally {
      setIsSharing(false);
    }
  };

  const content = (() => {
    if (isLoading || !data) return <ProfileSkeleton />;

    const { profile, character } = data;
    const heroReady = !data.errors.hero && profile && character;
    const signatureHex = resolveSignatureHex(character?.signature_color);
    const cosmetics = resolveEquippedCosmetics(character?.cosmetic_config);
    const stats =
      character &&
      character.stat_strength !== null &&
      character.stat_stamina !== null &&
      character.stat_agility !== null &&
      character.stat_focus !== null
        ? {
            strength: character.stat_strength,
            stamina: character.stat_stamina,
            agility: character.stat_agility,
            focus: character.stat_focus,
          }
        : null;
    const joined = joinedLabel(profile?.created_at);

    const rated = data.hasRatedBattle === true;
    const rating = ratingView({
      rating: profile?.rating,
      hasRatedBattle: rated,
    });
    const bestStreak = profile?.best_streak ?? 0;
    const rows = progressionRows({
      currentStreak: profile?.current_streak ?? 0,
      bestStreak,
      loginStreak: data.loginStreak,
      rank: data.seasonRank,
      hasRatedBattle: rated,
      unlock: nextUnlock(data.cosmeticItems ?? [], {
        wins: profile?.wins ?? 0,
        totalBattles: profile?.total_battles ?? 0,
        bestStreak,
        loginStreak: data.loginStreak,
      }),
    });

    return (
      <>
        {heroReady ? (
          <>
            {/* Plain wrapper with a native view behind it: this is what the
                share action captures. */}
            <View
              ref={heroRef}
              collapsable={false}
              style={{ backgroundColor: colors.background, padding: 8 }}
            >
              <FighterHero
                name={character.name}
                archetype={character.archetype}
                battleCry={character.battle_cry}
                itemName={data.itemName}
                renderUri={data.renderUri}
                signatureColor={signatureHex}
                stats={stats}
                cosmetics={cosmetics}
                onPress={openEditCharacter}
              />
            </View>
            <Text
              style={[
                styles.meta,
                accessibleText,
                { color: colors.textTertiary },
              ]}
            >
              @{profile.username}
              {joined ? ` · ${joined}` : ''}
            </Text>
          </>
        ) : (
          <ProfileErrorCard onRetry={retryAll} />
        )}

        <View style={styles.actions}>
          <ActionPill
            gameIcon="hanger"
            label="Edit look"
            onPress={openEditCharacter}
          />
          <ActionPill gameIcon="mask" label="Cosmetics" onPress={openShop} />
          <ActionPill
            gameIcon="share"
            label="Share card"
            onPress={() => void handleShareCard()}
            busy={isSharing}
            disabled={!heroReady}
          />
        </View>

        <ProgressionStrip
          rating={rating}
          rows={rows}
          onNavigate={navigate}
          error={data.errors.progression}
          onRetry={retrySection}
        />

        {data.errors.rivals ? (
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Text
              style={[styles.cardTitle, accessibleText, { color: colors.text }]}
              accessibilityRole="header"
            >
              Rivals
            </Text>
            <View style={styles.inlineError}>
              <Text
                style={[
                  styles.inlineErrorText,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                Couldn’t load your rivals.
              </Text>
              <Pressable
                onPress={retrySection}
                style={styles.inlineRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry"
              >
                <Text
                  style={[styles.inlineRetryText, { color: colors.primary }]}
                >
                  Retry
                </Text>
              </Pressable>
            </View>
          </View>
        ) : data.rivals.length > 0 ? (
          <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
            <Text
              style={[styles.cardTitle, accessibleText, { color: colors.text }]}
              accessibilityRole="header"
            >
              Rivals
            </Text>
            <Text
              style={[
                styles.navDescription,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              Who you have battled most in the last 30 days
            </Text>
            {data.rivals.map((r) => (
              <View key={r.summary.rivalProfileId}>
                <RivalRow
                  name={r.identity.name ?? r.summary.displayName}
                  archetype={r.identity.archetype}
                  signatureColor={r.identity.signatureColor}
                  record={r.record}
                  battlesCount={r.summary.battlesCount}
                />
                <PlayerSafetyActions
                  profileId={r.summary.rivalProfileId}
                  name={r.identity.name ?? r.summary.displayName}
                />
              </View>
            ))}
          </View>
        ) : null}

        <GameNavRow
          style={styles.navCard}
          gameIcon="stats"
          title="Stats"
          description="History, rating and past battles"
          accessibilityLabel="View your stats"
          onPress={() => router.push('/(profile)/stats')}
        />
        <GameNavRow
          style={styles.navCard}
          gameIcon="wallet"
          title="Wallet & Subscription"
          description="Credits, Prompt Wars+ subscription"
          onPress={() => router.push('/(profile)/wallet')}
        />
        <GameNavRow
          style={styles.navCard}
          gameIcon="mask"
          title="Cosmetic shop"
          description="Frames, titles, badges and colours"
          onPress={openShop}
        />
        <GameNavRow
          style={styles.navCard}
          gameIcon="blocked"
          title="Blocked users"
          description="Manage who you’ve blocked"
          onPress={() => router.push('/(profile)/blocked')}
        />
        <PracticeReplayButton />
        <GameNavRow
          style={styles.navCard}
          gameIcon="settings"
          title="Settings"
          description="Audio, notifications and account"
          onPress={() => router.push('/(profile)/settings')}
        />
      </>
    );
  })();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + Spacing.sm, paddingBottom: tabClearance },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <BrandMark size={168} />
      <GameHeader title="Your fighter" />
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  meta: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  pressed: {
    opacity: 0.7,
  },
  errorCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  errorTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  errorBody: {
    fontSize: Typography.sizes.base,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  retryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  infoCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
  },
  inlineRetry: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  inlineRetryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  navCard: { marginBottom: Spacing.sm },
  navDescription: {
    fontSize: Typography.sizes.sm,
  },
});
