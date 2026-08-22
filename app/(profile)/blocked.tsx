import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import {
  getBlockedProfiles,
  unblockUser,
  type BlockedProfile,
} from '@/utils/safety';

/**
 * Blocked players management.
 *
 * App Store guideline 1.2 expects blocking to be both discoverable and
 * reversible. Before this screen, `blockUser`/`unblockUser` existed in
 * utils/safety.ts with zero callers anywhere in the app.
 */
export default function BlockedPlayersScreen() {
  const colors = useThemedColors();
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBlocked(await getBlockedProfiles());
    } catch (err) {
      console.error('Failed to load blocked players:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmUnblock = (item: BlockedProfile) => {
    Alert.alert(
      'Unblock player?',
      `You may be matched with ${item.displayName} again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            setPendingId(item.profileId);
            try {
              await unblockUser(item.profileId);
              setBlocked((prev) =>
                prev.filter((b) => b.profileId !== item.profileId),
              );
            } catch (err) {
              Alert.alert(
                'Could not unblock',
                err instanceof Error ? err.message : 'Please try again.',
              );
            } finally {
              setPendingId(null);
            }
          },
        },
      ],
    );
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        Blocked Players
      </Text>

      <FlatList
        data={blocked}
        keyExtractor={(item) => item.profileId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            You have not blocked anyone. You can block a player from the report
            option on any battle result.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.card }]}>
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>
                {item.displayName}
              </Text>
              {item.username ? (
                <Text style={[styles.handle, { color: colors.textTertiary }]}>
                  @{item.username}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => confirmUnblock(item)}
              disabled={pendingId === item.profileId}
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${item.displayName}`}
              style={[
                styles.unblock,
                { borderColor: colors.border, minHeight: 44 },
              ]}
            >
              {pendingId === item.profileId ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.unblockText, { color: colors.primary }]}>
                  Unblock
                </Text>
              )}
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  list: { gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  rowText: { flex: 1 },
  name: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  handle: { fontSize: Typography.sizes.xs, marginTop: 1 },
  unblock: {
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  unblockText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  empty: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.xxl,
    lineHeight: 20,
  },
});
