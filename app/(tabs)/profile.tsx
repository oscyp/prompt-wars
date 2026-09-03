import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useTabClearance } from '@/hooks/useTabClearance';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { PUBLIC_PROFILE_COLUMNS } from '@/utils/profiles';
import { getRivals, type RivalSummary } from '@/utils/battles';
import { loadPortraitRef, resolveSignatureHex } from '@/utils/characters';
import { inkFor } from '@/utils/contrast';
import { CosmeticTitle, CosmeticBadge, PortraitPreview } from '@/components';
import {
  resolveEquippedCosmetics,
  NO_COSMETICS,
  type EquippedCosmetics,
} from '@/utils/cosmetics';

const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const HEADER_PORTRAIT_SIZE = 72;

interface ProfileRow {
  username: string;
  display_name: string | null;
  rating: number | null;
  total_battles: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
}

interface CharacterHeaderRow {
  archetype: string | null;
  avatar_portrait_id: string | null;
  portrait_id: string | null;
  signature_color: string | null;
  cosmetic_config: Record<string, string> | null;
}

interface HeaderAvatar {
  url: string | null;
  archetype: string | null;
  signatureColor: string | null;
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

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const tabClearance = useTabClearance();
  const { user, signOut } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [cosmetics, setCosmetics] = useState<EquippedCosmetics>(NO_COSMETICS);
  const [avatar, setAvatar] = useState<HeaderAvatar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rivals, setRivals] = useState<RivalSummary[]>([]);
  const lastLoadRef = useRef(0);

  const loadProfile = useCallback(async () => {
    lastLoadRef.current = Date.now();
    if (!userId) {
      // Returning before the finally used to leave the spinner up for good.
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const [profileRes, characterRes, rivalsRes] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select(PUBLIC_PROFILE_COLUMNS)
          .eq('id', userId)
          .single(),
        // Cosmetics and the avatar hang off the active CHARACTER, not the
        // profile: equip_cosmetic takes a character id. Titles, badges and the
        // portrait are player-facing though, so they belong on the header.
        supabase
          .from('characters')
          .select(
            'archetype, avatar_portrait_id, portrait_id, signature_color, cosmetic_config',
          )
          .eq('profile_id', userId)
          .eq('is_active', true)
          .maybeSingle(),
        // Rivals have been computed and written on every completed battle
        // since launch; this is the read-only surface over that data.
        getRivals(),
      ]);

      if (profileRes.status === 'fulfilled') {
        if (profileRes.value.error) {
          console.error('Failed to load profile:', profileRes.value.error);
        } else {
          setProfile(profileRes.value.data as unknown as ProfileRow);
        }
      } else {
        console.error('Failed to load profile:', profileRes.reason);
      }

      if (characterRes.status === 'fulfilled' && characterRes.value.data) {
        const character = characterRes.value
          .data as unknown as CharacterHeaderRow;
        setCosmetics(resolveEquippedCosmetics(character.cosmetic_config));
        const portraitId =
          character.avatar_portrait_id ?? character.portrait_id ?? null;
        const ref = portraitId ? await loadPortraitRef(portraitId) : null;
        setAvatar({
          url: ref?.url ?? null,
          archetype: character.archetype,
          signatureColor: character.signature_color,
        });
      }

      if (rivalsRes.status === 'fulfilled') {
        setRivals(rivalsRes.value);
      }
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
        void loadProfile();
        return;
      }
      if (Date.now() - lastLoadRef.current < FOCUS_REFETCH_DEBOUNCE_MS) return;
      void loadProfile();
    }, [loadProfile]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadProfile();
  };

  // Through the provider, not `supabase.auth.signOut()` directly: the provider
  // is what deactivates this device's push token. Calling the client straight
  // left signed-out devices receiving the account's battle notifications.
  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

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

  // The character is never an initial: a signed portrait when there is one,
  // otherwise the bundled archetype illustration.
  const portraitUri =
    avatar?.url ??
    Image.resolveAssetSource(getArchetypeAvatar(avatar?.archetype))?.uri ??
    '';

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
      <Text
        style={[styles.title, { color: colors.text }]}
        accessibilityRole="header"
      >
        Profile
      </Text>

      {profile ? (
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <PortraitPreview
            uri={portraitUri}
            variant="circle"
            size={HEADER_PORTRAIT_SIZE}
            accentColor={
              avatar?.signatureColor
                ? resolveSignatureHex(avatar.signatureColor)
                : colors.primary
            }
            frame={cosmetics.frame}
            avatarEffect={cosmetics.avatarEffect}
            accessibilityLabel="Your character's portrait"
          />
          <View style={styles.nameRow}>
            <Text style={[styles.displayName, { color: colors.text }]}>
              {profile.display_name || profile.username}
            </Text>
            <CosmeticBadge badge={cosmetics.badge} size={18} />
          </View>
          <CosmeticTitle title={cosmetics.title} />
          <Text
            style={[
              styles.username,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            @{profile.username}
          </Text>
        </View>
      ) : null}

      {/* Lifetime record. Titled "Record" so it does not collide with the
          "Stats" card below, which opens the detailed screen. */}
      {profile ? (
        <View style={[styles.statsCard, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            accessibilityRole="header"
          >
            Record
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text
                style={[
                  styles.statValue,
                  NumericFontVariant,
                  { color: colors.primary },
                ]}
              >
                {profile.total_battles || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Battles
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text
                style={[
                  styles.statValue,
                  NumericFontVariant,
                  { color: colors.success },
                ]}
              >
                {profile.wins || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Wins
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text
                style={[
                  styles.statValue,
                  NumericFontVariant,
                  { color: colors.error },
                ]}
              >
                {profile.losses || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Losses
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text
                style={[
                  styles.statValue,
                  NumericFontVariant,
                  { color: colors.warning },
                ]}
              >
                {profile.draws || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Draws
              </Text>
            </View>
          </View>
          <View style={[styles.ratingRow, { borderTopColor: colors.border }]}>
            <Text
              style={[
                styles.ratingLabel,
                accessibleText,
                { color: colors.textSecondary },
              ]}
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
              {Math.round(profile.rating || 1500)}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Information only: nothing here opens anything, so no card affordance. */}
      {rivals.length > 0 ? (
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
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
          {rivals.map((r) => (
            <View
              key={r.rivalProfileId}
              style={styles.rivalRow}
              accessible
              accessibilityLabel={`${r.displayName}, ${r.battlesCount} ${
                r.battlesCount === 1 ? 'battle' : 'battles'
              }`}
            >
              <Text
                style={[
                  styles.rivalName,
                  accessibleText,
                  { color: colors.text },
                ]}
              >
                {r.displayName}
              </Text>
              <Text
                style={[
                  styles.rivalCount,
                  NumericFontVariant,
                  { color: colors.textSecondary },
                ]}
              >
                {r.battlesCount} {r.battlesCount === 1 ? 'battle' : 'battles'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Navigation Cards */}
      <NavCard
        title="Edit Character"
        description="Name, archetype, look and gear"
        onPress={() => router.push('/(profile)/edit-character')}
      />
      <NavCard
        title="Wallet & Subscription"
        description="Credits, Prompt Wars+ subscription"
        onPress={() => router.push('/(profile)/wallet')}
      />
      <NavCard
        title="Stats"
        description="Detailed stats and past battles"
        accessibilityLabel="View your stats"
        onPress={() => router.push('/(profile)/stats')}
      />
      <NavCard
        title="Settings"
        description="Accessibility, notifications, preferences"
        onPress={() => router.push('/(profile)/settings')}
      />

      {/* Sign Out */}
      <TouchableOpacity
        style={[styles.signOutButton, { backgroundColor: colors.error }]}
        onPress={handleSignOut}
        accessibilityLabel="Sign out"
        accessibilityRole="button"
      >
        <Text style={[styles.signOutText, { color: inkFor(colors.error) }]}>
          Sign Out
        </Text>
      </TouchableOpacity>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
  },
  profileCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  displayName: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  username: {
    fontSize: Typography.sizes.base,
  },
  statsCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  infoCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statItem: {
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
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ratingLabel: {
    fontSize: Typography.sizes.base,
  },
  ratingValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
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
  rivalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  rivalName: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  rivalCount: {
    fontSize: Typography.sizes.sm,
  },
  signOutButton: {
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  signOutText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
