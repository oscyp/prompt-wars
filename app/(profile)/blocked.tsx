import { GameFeedback } from '@/components/game/GameFeedback';
import { GameText as Text, GamePanel, GameButton } from '@/components/game';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Layout,
} from '@/constants/DesignTokens';
import Toast from '@/components/Toast';
import {
  getBlockedProfiles,
  unblockUser,
  type BlockedProfile,
} from '@/utils/safety';
import { blockedAtLabel } from '@/utils/walletView';

type LoadState = 'loading' | 'ready' | 'error';

const TOAST_MS = 2500;

/**
 * Blocked players management.
 *
 * App Store guideline 1.2 expects blocking to be both discoverable and
 * reversible. Before this screen, `blockUser`/`unblockUser` existed in
 * utils/safety.ts with zero callers anywhere in the app.
 */
export default function BlockedPlayersScreen() {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const [blocked, setBlocked] = useState<BlockedProfile[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  const load = useCallback(async () => {
    try {
      setBlocked(await getBlockedProfiles());
      setLoadState('ready');
    } catch (err) {
      console.error('Failed to load blocked players:', err);
      // An empty list means "you have blocked nobody"; a failed read must not
      // be allowed to say that.
      setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = () => {
    setLoadState('loading');
    load();
  };

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
              showToast(`Unblocked ${item.displayName}`);
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

  const topInset = Spacing.md;

  if (loadState === 'loading') {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <GameFeedback
          icon="shield-check"
          title="Loading blocked players"
          busy
        />
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <GameFeedback
          icon="shield-check"
          title="Couldn’t load your block list"
          message="Check your connection and try again."
          tone="error"
          action={{ label: 'Retry', onPress: retry }}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topInset },
      ]}
    >
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
          <GameFeedback
            icon="shield-check"
            title="No blocked players"
            message="You have not blocked anyone. Use Safety beside a player or on a battle result to report or block them."
          />
        }
        renderItem={({ item }) => {
          const since = blockedAtLabel(item.blockedAt);
          const pending = pendingId === item.profileId;
          return (
            <GamePanel style={[styles.row, { backgroundColor: colors.card }]}>
              <View
                style={styles.rowText}
                accessible
                accessibilityLabel={[
                  item.displayName,
                  item.username ? `@${item.username}` : null,
                  since,
                ]
                  .filter(Boolean)
                  .join(', ')}
              >
                <Text
                  style={[styles.name, accessibleText, { color: colors.text }]}
                >
                  {item.displayName}
                </Text>
                {item.username ? (
                  <Text style={[styles.handle, { color: colors.textTertiary }]}>
                    @{item.username}
                  </Text>
                ) : null}
                {since ? (
                  <Text style={[styles.since, { color: colors.textTertiary }]}>
                    {since}
                  </Text>
                ) : null}
              </View>
              <GameButton
                label="Unblock"
                accessibilityLabel={`Unblock ${item.displayName}`}
                onPress={() => confirmUnblock(item)}
                busy={pending}
                tone="secondary"
              />
            </GamePanel>
          );
        }}
      />
      {toast ? <Toast text={toast} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
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
    color: '#171225',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  list: { gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  since: { fontSize: Typography.sizes.xs, marginTop: Spacing.xs },
  unblock: {
    paddingHorizontal: Spacing.md,
    minHeight: Layout.inputHeight,
    minWidth: Layout.inputHeight,
    justifyContent: 'center',
    alignItems: 'center',
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
