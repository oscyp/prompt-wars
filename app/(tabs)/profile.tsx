import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';

export default function ProfileScreen() {
  const router = useRouter();
  const colors = useThemedColors();
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Failed to load profile:', error);
      } else {
        setProfile(data);
      }
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
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Profile</Text>

      {profile && (
        <View style={[styles.profileCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.displayName, { color: colors.text }]}>
            {profile.display_name || profile.username}
          </Text>
          <Text style={[styles.username, { color: colors.textSecondary }]}>
            @{profile.username}
          </Text>
        </View>
      )}

      {/* Stats Summary */}
      {profile && (
        <View style={[styles.statsCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {profile.total_battles || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Battles</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {profile.wins || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Wins</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.error }]}>
                {profile.losses || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Losses</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.warning }]}>
                {profile.draws || 0}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Draws</Text>
            </View>
          </View>
          <View style={styles.ratingRow}>
            <Text style={[styles.ratingLabel, { color: colors.textSecondary }]}>Rating</Text>
            <Text style={[styles.ratingValue, { color: colors.primary }]}>
              {Math.round(profile.rating || 1500)}
            </Text>
          </View>
        </View>
      )}

      {/* Navigation Cards */}
      <TouchableOpacity
        style={[styles.navCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/(profile)/edit-character')}
        accessibilityLabel="Edit character"
        accessibilityRole="button"
      >
        <Text style={[styles.navTitle, { color: colors.text }]}>Edit Character</Text>
        <Text style={[styles.navDescription, { color: colors.textSecondary }]}>
          Portrait, battle cry, signature item, traits
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/(profile)/wallet')}
        accessibilityLabel="View wallet"
        accessibilityRole="button"
      >
        <Text style={[styles.navTitle, { color: colors.text }]}>Wallet & Subscription</Text>
        <Text style={[styles.navDescription, { color: colors.textSecondary }]}>
          Credits, Prompt Wars+ subscription
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/(profile)/stats')}
        accessibilityLabel="View detailed stats"
        accessibilityRole="button"
      >
        <Text style={[styles.navTitle, { color: colors.text }]}>Battle History</Text>
        <Text style={[styles.navDescription, { color: colors.textSecondary }]}>
          View your prompt journal and past battles
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.navCard, { backgroundColor: colors.card }]}
        onPress={() => router.push('/(profile)/settings')}
        accessibilityLabel="Settings"
        accessibilityRole="button"
      >
        <Text style={[styles.navTitle, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.navDescription, { color: colors.textSecondary }]}>
          Accessibility, notifications, preferences
        </Text>
      </TouchableOpacity>

      {/* Sign Out */}
      <TouchableOpacity
        style={[styles.signOutButton, { backgroundColor: colors.error }]}
        onPress={handleSignOut}
        accessibilityLabel="Sign out"
        accessibilityRole="button"
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    borderRadius: 12,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  displayName: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  username: {
    fontSize: Typography.sizes.base,
  },
  statsCard: {
    padding: Spacing.lg,
    borderRadius: 12,
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  ratingLabel: {
    fontSize: Typography.sizes.base,
  },
  ratingValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  navCard: {
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  navTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  navDescription: {
    fontSize: Typography.sizes.sm,
  },
  signOutButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
