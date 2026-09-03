import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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

interface NavCardProps {
  title: string;
  description: string;
  onPress: () => void;
  /** Defaults to the visible title, so what is read matches what is seen. */
  accessibilityLabel?: string;
}

function NavCard({
  title,
  description,
  onPress,
  accessibilityLabel,
}: NavCardProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <TouchableOpacity
      style={[styles.navCard, { backgroundColor: colors.card }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={description}
    >
      <View style={styles.navText}>
        <Text style={[styles.navTitle, accessibleText, { color: colors.text }]}>
          {title}
        </Text>
        <Text
          style={[
            styles.navDescription,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {description}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

interface ActionPillProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}

function ActionPill({
  icon,
  label,
  onPress,
  busy = false,
  disabled = false,
}: ActionPillProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const inactive = busy || disabled;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && !inactive ? styles.pressed : null,
        inactive ? styles.pillDisabled : null,
      ]}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={icon} size={18} color={colors.text} />
      )}
      <Text
        style={[styles.pillText, accessibleText, { color: colors.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ProfileErrorCard({ onRetry }: { onRetry: () => void }) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <View style={[styles.errorCard, { backgroundColor: colors.card }]}>
      <Text
        style={[styles.errorTitle, accessibleText, { color: colors.text }]}
        accessibilityRole="header"
      >
        {PROFILE_ERROR_COPY.title}
      </Text>
      <Text
        style={[
          styles.errorBody,
          accessibleText,
          { color: colors.textSecondary },
        ]}
      >
        {PROFILE_ERROR_COPY.body}
      </Text>
      <Pressable
        style={({ pressed }) => [
          styles.retryButton,
          { backgroundColor: colors.primary },
          pressed ? styles.pressed : null,
        ]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={PROFILE_ERROR_COPY.retry}
      >
        <Text style={[styles.retryText, { color: colors.background }]}>
          {PROFILE_ERROR_COPY.retry}
        </Text>
      </Pressable>
    </View>
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
            <View ref={heroRef} collapsable={false}>
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
            icon="brush-outline"
            label="Edit look"
            onPress={openEditCharacter}
          />
          <ActionPill
            icon="sparkles-outline"
            label="Cosmetics"
            onPress={openShop}
          />
          <ActionPill
            icon="share-outline"
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
              <RivalRow
                key={r.summary.rivalProfileId}
                name={r.identity.name ?? r.summary.displayName}
                archetype={r.identity.archetype}
                signatureColor={r.identity.signatureColor}
                record={r.record}
                battlesCount={r.summary.battlesCount}
              />
            ))}
          </View>
        ) : null}

        <NavCard
          title="Stats"
          description="History, rating and past battles"
          accessibilityLabel="View your stats"
          onPress={() => router.push('/(profile)/stats')}
        />
        <NavCard
          title="Wallet & Subscription"
          description="Credits, Prompt Wars+ subscription"
          onPress={() => router.push('/(profile)/wallet')}
        />
        <NavCard
          title="Cosmetic shop"
          description="Frames, titles, badges and colours"
          onPress={openShop}
        />
        <NavCard
          title="Blocked users"
          description="Manage who you’ve blocked"
          onPress={() => router.push('/(profile)/blocked')}
        />
        <NavCard
          title="Settings"
          description="Accessibility, notifications, account"
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
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  inlineRetryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 56,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  navText: {
    flex: 1,
  },
  navTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  navDescription: {
    fontSize: Typography.sizes.sm,
  },
});
