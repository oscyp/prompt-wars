import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  Layout,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';
import {
  ArchetypeBadge,
  Card,
  GlowGradientButton,
  HapticPressable,
  ScreenContainer,
  StatGrid,
  type StatItem,
} from '@/components';

function tierForRating(r: number) {
  if (r >= 2200) return { label: 'GRANDMASTER', color: '#FFD700' };
  if (r >= 1900) return { label: 'MASTER', color: '#C77DFF' };
  if (r >= 1700) return { label: 'DIAMOND', color: '#22D3EE' };
  if (r >= 1500) return { label: 'PLATINUM', color: '#A78BFA' };
  if (r >= 1300) return { label: 'GOLD', color: '#FBBF24' };
  if (r >= 1100) return { label: 'SILVER', color: '#94A3B8' };
  return { label: 'BRONZE', color: '#A16207' };
}

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [character, setCharacter] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    try {
      const [{ data: prof }, { data: char }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('characters')
          .select('*')
          .eq('profile_id', user.id)
          .maybeSingle(),
      ]);
      setProfile(prof);
      setCharacter(char);
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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
  const rating = Math.round(profile?.rating ?? 1500);
  const tier = tierForRating(rating);
  const total = profile?.total_battles || 0;
  const wins = profile?.wins || 0;
  const winRate = total ? Math.round((wins / total) * 100) : 0;

  const stats: StatItem[] = [
    { label: 'Battles', value: total, accent: colors.text },
    { label: 'Wins', value: wins, accent: colors.success },
    { label: 'Losses', value: profile?.losses ?? 0, accent: colors.error },
    { label: 'Win Rate', value: `${winRate}%`, accent: colors.accent },
  ];

  const navItems: Array<{
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    title: string;
    description: string;
    route: string;
    tint: string;
  }> = [
    {
      icon: 'wallet-outline',
      title: 'Wallet & Subscription',
      description: 'Credits, Prompt Wars+',
      route: '/(profile)/wallet',
      tint: colors.gold,
    },
    {
      icon: 'chart-line',
      title: 'Battle Stats',
      description: 'Detailed history & analytics',
      route: '/(profile)/stats',
      tint: colors.accent,
    },
    {
      icon: 'cog-outline',
      title: 'Settings',
      description: 'Accessibility, notifications',
      route: '/(profile)/settings',
      tint: colors.textSecondary,
    },
  ];

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
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Card variant="gradient" archetypeId={archetypeId} style={styles.hero}>
          <ArchetypeBadge archetypeId={archetypeId} size="xl" animated />
          <Text style={styles.heroName}>
            {character?.name || profile?.display_name || profile?.username}
          </Text>
          <Text style={styles.heroUsername}>@{profile?.username}</Text>
          <View
            style={[
              styles.tierChip,
              {
                backgroundColor: `${tier.color}26`,
                borderColor: tier.color,
              },
            ]}
          >
            <MaterialCommunityIcons name="shield-star" size={14} color={tier.color} />
            <Text style={[styles.tierText, { color: tier.color }]}>
              {tier.label} · {rating}
            </Text>
          </View>
          {character?.battle_cry ? (
            <Text style={styles.battleCry}>"{character.battle_cry}"</Text>
          ) : null}
          <Text style={styles.archetypeTag}>
            {archetype.shortName.toUpperCase()}
          </Text>
        </Card>

        {/* Stats */}
        <View style={styles.section}>
          <StatGrid stats={stats} columns={2} />
        </View>

        {/* Nav */}
        <View style={styles.section}>
          {navItems.map((item) => (
            <HapticPressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              haptic="light"
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <Card variant="glass" style={styles.navCard}>
                <View
                  style={[
                    styles.navIconWrap,
                    { backgroundColor: `${item.tint}1F` },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={22}
                    color={item.tint}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.navTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.navDescription, { color: colors.textSecondary }]}
                  >
                    {item.description}
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

        {/* Sign out */}
        <View style={{ marginTop: Spacing.xl }}>
          <GlowGradientButton
            title="Sign Out"
            onPress={handleSignOut}
            variant="ghost"
            size="md"
            fullWidth
            iconLeft="logout-variant"
            accessibilityLabel="Sign out"
          />
        </View>
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
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  heroName: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.display3,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  heroUsername: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: Spacing.sm,
  },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  tierText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.wider,
  },
  battleCry: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.85)',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  archetypeTag: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: Typography.letterSpacing.widest,
    marginTop: Spacing.sm,
  },
  section: {
    marginTop: Spacing.lg,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.base,
    marginBottom: 2,
  },
  navDescription: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
  },
});
