import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Layout,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { getMyBattles } from '@/utils/battles';
import { useAuth } from '@/providers/AuthProvider';
import {
  Card,
  GlowGradientButton,
  HapticPressable,
  ScreenContainer,
  SectionHeader,
} from '@/components';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function BattlesScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [battles, setBattles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const getOpponentName = (battle: any): string => {
    if (!user) return 'opponent';
    if (battle.player_one_id === user.id) {
      return (
        battle.player_two?.display_name ||
        (battle.is_player_two_bot ? 'Bot' : 'Waiting…')
      );
    }
    return battle.player_one?.display_name || 'opponent';
  };

  const getIsWinner = (battle: any) =>
    user && battle.winner_id && battle.winner_id === user.id;

  const loadBattles = async () => {
    try {
      const data = await getMyBattles(50);
      setBattles(data || []);
    } catch (err) {
      console.error('Failed to load battles:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBattles();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadBattles();
  };

  const navigateToBattle = (battle: any) => {
    if (battle.status === 'waiting_for_prompts') {
      router.push(`/(battle)/prompt-entry?battleId=${battle.id}`);
    } else if (
      battle.status === 'result_ready' ||
      battle.status === 'completed'
    ) {
      router.push(`/(battle)/result?battleId=${battle.id}`);
    } else {
      router.push(`/(battle)/waiting?battleId=${battle.id}`);
    }
  };

  const renderBattle = ({ item }: { item: any }) => {
    const outcome = item.is_draw
      ? 'draw'
      : item.winner_id
      ? getIsWinner(item)
        ? 'win'
        : 'loss'
      : null;
    const outcomeMeta: Record<
      string,
      { label: string; bg: string; fg: string; icon: string }
    > = {
      win: {
        label: 'VICTORY',
        bg: `${colors.gold}22`,
        fg: colors.gold,
        icon: 'crown',
      },
      loss: {
        label: 'DEFEAT',
        bg: `${colors.error}22`,
        fg: colors.error,
        icon: 'skull-outline',
      },
      draw: {
        label: 'DRAW',
        bg: `${colors.warning}22`,
        fg: colors.warning,
        icon: 'equal',
      },
    };
    const meta = outcome ? outcomeMeta[outcome] : null;
    const isLive = !outcome;

    return (
      <HapticPressable
        onPress={() => navigateToBattle(item)}
        haptic="light"
        accessibilityRole="button"
        accessibilityLabel={`Battle against ${getOpponentName(item)}`}
      >
        <Card variant="glass" style={styles.battleCard}>
          <View style={styles.battleHeader}>
            <Text style={[styles.opponent, { color: colors.text }]} numberOfLines={1}>
              vs {getOpponentName(item)}
            </Text>
            {meta ? (
              <View style={[styles.outcomeChip, { backgroundColor: meta.bg }]}>
                <MaterialCommunityIcons
                  name={meta.icon as any}
                  size={12}
                  color={meta.fg}
                />
                <Text style={[styles.outcomeText, { color: meta.fg }]}>
                  {meta.label}
                </Text>
              </View>
            ) : (
              <View
                style={[
                  styles.outcomeChip,
                  { backgroundColor: `${colors.accent}22` },
                ]}
              >
                <View
                  style={[styles.liveDot, { backgroundColor: colors.accent }]}
                />
                <Text style={[styles.outcomeText, { color: colors.accent }]}>
                  {item.status.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          {item.theme ? (
            <Text style={[styles.theme, { color: colors.textSecondary }]} numberOfLines={1}>
              "{item.theme}"
            </Text>
          ) : null}
          <View style={styles.footer}>
            <Text style={[styles.date, { color: colors.textTertiary }]}>
              {timeAgo(item.created_at)}
            </Text>
            {isLive && (
              <Text style={[styles.tap, { color: colors.accent }]}>Tap to resume →</Text>
            )}
          </View>
        </Card>
      </HapticPressable>
    );
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

  return (
    <ScreenContainer padded={false}>
      <View
        style={[
          styles.headerWrap,
          { paddingTop: insets.top + Spacing.lg },
        ]}
      >
        <SectionHeader
          title="Battle Log"
          eyebrow="Your war journal"
          size="hero"
        />
      </View>

      {battles.length === 0 ? (
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyIconWrap,
              { backgroundColor: colors.surface1 },
            ]}
          >
            <MaterialCommunityIcons
              name="sword-cross"
              size={48}
              color={colors.textTertiary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No battles yet
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Step into the arena and claim your first victory.
          </Text>
          <View style={{ marginTop: Spacing.lg, width: '70%' }}>
            <GlowGradientButton
              title="Start First Battle"
              onPress={() => router.push('/(tabs)/create')}
              variant="primary"
              size="lg"
              fullWidth
              iconLeft="sword"
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={battles}
          renderItem={renderBattle}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            {
              paddingBottom:
                insets.bottom + Layout.tabBarHeight + Spacing.xxl,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  battleCard: {
    marginBottom: Spacing.sm,
  },
  battleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  opponent: {
    flex: 1,
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.lg,
  },
  outcomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  outcomeText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: Typography.letterSpacing.wider,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  theme: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  date: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.xs,
  },
  tap: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    letterSpacing: Typography.letterSpacing.wide,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Layout.tabBarHeight + Spacing.xxl,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontFamily: Typography.fonts.display,
    fontSize: Typography.sizes.xxl,
    letterSpacing: Typography.letterSpacing.wide,
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.base,
    textAlign: 'center',
    lineHeight: Typography.sizes.base * 1.5,
  },
});
