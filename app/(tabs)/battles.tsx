import { GameBevel } from '@/components/game';
import { GameButton, GameHeader } from '@/components/game';
import { GameText } from '@/components/game';
import BattleListPortrait from '@/components/BattleListPortrait';
import PlayerSafetyActions from '@/components/PlayerSafetyActions';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  Pressable,
  RefreshControl,
  Image,
  useWindowDimensions,
  type ViewToken,
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
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { UiArt } from '@/constants/UiArt';
import {
  getActiveBattles,
  activeBattleDeadline,
  getFinishedBattlePage,
  type BattleHistoryCursor,
  groupBattlesForList,
  battleSectionLabel,
  describeBattleRow,
  battleRouteFor,
  statusToneColor,
  seriesScoreFor,
  seriesLabel,
  opponentProfileIds,
  iHaveLockedIn,
  type BattleListRow,
  type BattleListSection,
} from '@/utils/battleLists';
import {
  modeLabel,
  exactBattleDeadline,
  type BattleOutcome,
} from '@/utils/battleCopy';
import { opponentIdentityFor } from '@/utils/opponentIdentity';
import {
  fetchPublicPlayers,
  type PublicPlayerMap,
} from '@/utils/publicPlayers';
import { resolveSignatureHex } from '@/utils/characters';
import { shortDate } from '@/utils/walletView';
import { inkFor } from '@/utils/contrast';
import { hapticSelection } from '@/utils/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { InlineBanner } from '@/components';
import { useBattleSheet } from '@/components/BattleModeSheet';
import ListSkeleton from '@/components/ListSkeleton';
import { useLeaveBattle } from '@/hooks/useLeaveBattle';
import {
  canLeaveBattleStatus,
  hasOpponent,
  leaveActionLabel,
  type BattleMode,
} from '@/utils/battles';
import type { BattleFormat } from '@/types/battle';

type IoniconName = React.ComponentProps<typeof GameSymbol>['name'];

const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const AVATAR_SIZE = 44;
/** Rows with nowhere to go (timed out, cancelled) read as inert. */
const DISABLED_ROW_OPACITY = 0.6;

interface OutcomePresentation {
  word: string;
  icon: IoniconName;
  color: string;
}

function BattleLeaveAction({
  battle,
  userId,
  color,
  onLeft,
}: {
  battle: BattleListRow;
  userId: string | undefined;
  color: string;
  onLeft: () => void;
}) {
  const isBot = battle.is_player_two_bot === true;
  const mode = (battle.mode ?? 'ranked') as BattleMode;
  const label = leaveActionLabel({
    status: battle.status,
    mode,
    isBot,
    hasOpponent: hasOpponent(battle),
  });
  const leave = useLeaveBattle(battle.id, {
    format: (battle.format ?? 'single') as BattleFormat,
    mode,
    isBot,
    myProfileId: userId,
    hasLockedPrompt: iHaveLockedIn(battle, userId),
  });

  return (
    <GameButton
      style={styles.rowLeaveAction}
      onPress={(event) => {
        event.stopPropagation();
        leave.confirmLeave(onLeft);
      }}
      disabled={leave.isLeaving}
      accessibilityRole="button"
      accessibilityLabel={`${label} battle`}
      accessibilityState={{ disabled: leave.isLeaving }}
      tone="secondary"
      label={leave.isLeaving ? 'Leaving…' : label}
    />
  );
}

/** Word + icon + colour for a resolved battle; null while there is nothing to say. */
function outcomePresentation(
  outcome: BattleOutcome,
  colors: { success: string; error: string; warning: string },
): OutcomePresentation | null {
  switch (outcome) {
    case 'win':
      return { word: 'Victory', icon: 'trophy', color: colors.success };
    case 'loss':
      return { word: 'Defeat', icon: 'close-circle', color: colors.error };
    case 'draw':
      return { word: 'Draw', icon: 'remove-circle', color: colors.warning };
    default:
      return null;
  }
}

export default function BattlesScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const tabClearance = useTabClearance();
  const battleSheet = useBattleSheet();
  const { user } = useAuth();
  const userId = user?.id;
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || width < 360;
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<BattleListRow>[] }) => {
      setVisibleIds(
        new Set(
          viewableItems
            .filter((token) => token.isViewable && token.item?.id)
            .map((token) => token.item.id),
        ),
      );
    },
  ).current;
  const [battles, setBattles] = useState<BattleListRow[]>([]);
  const [nextCursor, setNextCursor] = useState<BattleHistoryCursor | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [players, setPlayers] = useState<PublicPlayerMap>(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastLoadRef = useRef(0);

  const loadBattles = useCallback(async () => {
    lastLoadRef.current = Date.now();
    try {
      const [active, history] = await Promise.all([
        getActiveBattles(100),
        getFinishedBattlePage(),
      ]);
      const data = [...active, ...history.items];
      setNextCursor(history.nextCursor);
      // Live rows have no reveal payload yet; the public view supplies the
      // opponent's archetype and colour. Never rejects.
      const known = await fetchPublicPlayers(opponentProfileIds(data, userId));
      setBattles(data);
      setPlayers(known);
      setLoadError(false);
    } catch (err) {
      console.error('Failed to load battles:', err);
      setLoadError(true);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (lastLoadRef.current === 0) {
        void loadBattles();
        return;
      }
      if (Date.now() - lastLoadRef.current < FOCUS_REFETCH_DEBOUNCE_MS) return;
      void loadBattles();
    }, [loadBattles]),
  );

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getFinishedBattlePage(nextCursor);
      const known = await fetchPublicPlayers(
        opponentProfileIds(page.items, userId),
      );
      setBattles((current) => [
        ...current,
        ...page.items.filter(
          (row) => !current.some((existing) => existing.id === row.id),
        ),
      ]);
      setPlayers((current) => new Map([...current, ...known]));
      setNextCursor(page.nextCursor);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void loadBattles();
  };

  const openBattleSheet = () => {
    hapticSelection();
    battleSheet.open();
  };

  const sections = useMemo(
    () => groupBattlesForList(battles, userId),
    [battles, userId],
  );

  const renderBattle = ({ item }: { item: BattleListRow }) => {
    const view = describeBattleRow(item, userId);
    const route = battleRouteFor(item, userId);
    const toneColor = statusToneColor(view.status.tone, colors);
    const outcome = outcomePresentation(view.outcome, colors);
    // A finished battle's status IS its outcome; the footer says it once.
    const showChip = item.status !== 'completed' || !outcome;
    const chipFilled = view.status.actionable;
    const mode = modeLabel(item.mode);
    const identity = opponentIdentityFor(item, userId, players);
    const name = identity.name ?? view.opponentName;
    // Bots keep the neutral illustration and a plain ring.
    const art = archetypeIllustrationUri(identity.archetype) ?? '';
    const ring = identity.signatureColor
      ? resolveSignatureHex(identity.signatureColor)
      : colors.border;
    // Series score and knockout only once there is a result to score.
    const series = outcome ? seriesScoreFor(item, userId) : null;
    const knockout = Boolean(outcome) && item.is_ko === true;
    const date = shortDate(item.created_at);
    const deadline = activeBattleDeadline(item, userId);
    const label = [
      `Battle against ${name}`,
      showChip ? view.status.label : null,
      outcome?.word ?? null,
      series ? `Series ${seriesLabel(series)}` : null,
      knockout ? 'Knockout' : null,
      mode,
      item.theme ? `Theme: ${item.theme}` : null,
      date,
    ]
      .filter(Boolean)
      .join('. ');

    const opponentId =
      item.player_one_id === userId ? item.player_two_id : item.player_one_id;
    return (
      <View>
        <Pressable
          style={({ pressed }) => [
            styles.battleCard,
            stacked && styles.stackedCard,
            {
              backgroundColor: colors.card,
              borderColor: chipFilled ? colors.primary : colors.borderLight,
              borderWidth: chipFilled ? 1 : StyleSheet.hairlineWidth,
              opacity: !route ? DISABLED_ROW_OPACITY : pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => {
            if (route) router.push(route);
          }}
          disabled={!route}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !route }}
        >
          <GameBevel
            color={chipFilled ? colors.primary : colors.ornamentMuted}
          />
          <BattleListPortrait
            accountId={userId}
            battleId={item.id}
            side={item.player_one_id === userId ? 'player_two' : 'player_one'}
            snapshot={item.identity_snapshot}
            visible={visibleIds.has(item.id)}
            fallbackUri={art}
            accentColor={ring}
            name={name}
            size={AVATAR_SIZE}
          />
          <View style={[styles.battleBody, stacked && styles.stackedBody]}>
            <View
              style={[styles.battleHeader, stacked && styles.stackedHeader]}
            >
              <GameText
                variant="fighter"
                style={[
                  styles.opponent,
                  stacked && styles.stackedOpponent,
                  accessibleText,
                  { color: colors.text },
                ]}
              >
                vs {name}
              </GameText>
              {showChip ? (
                <View
                  style={[
                    styles.statusChip,
                    chipFilled
                      ? { backgroundColor: toneColor, borderColor: toneColor }
                      : { borderColor: toneColor },
                  ]}
                >
                  <GameText
                    variant="body"
                    style={[
                      styles.status,
                      { color: chipFilled ? inkFor(toneColor) : toneColor },
                    ]}
                  >
                    {view.status.label}
                  </GameText>
                </View>
              ) : null}
            </View>
            <GameText
              variant="caption"
              style={[
                styles.meta,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              {item.theme ? `${mode} · ${item.theme}` : mode}
            </GameText>
            {deadline ? (
              <GameText
                variant="caption"
                style={[
                  styles.meta,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                {exactBattleDeadline(deadline)}
              </GameText>
            ) : null}
            <View
              style={[styles.battleFooter, stacked && styles.stackedFooter]}
            >
              {outcome ? (
                <View style={styles.outcomeRow}>
                  <GameSymbol
                    name={outcome.icon}
                    size={14}
                    color={outcome.color}
                  />
                  <GameText
                    variant="body"
                    style={[styles.result, { color: outcome.color }]}
                  >
                    {outcome.word}
                  </GameText>
                  {series ? (
                    <GameText
                      variant="body"
                      style={[
                        styles.series,
                        NumericFontVariant,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {seriesLabel(series)}
                    </GameText>
                  ) : null}
                  {knockout ? (
                    <GameText
                      variant="body"
                      style={[
                        styles.koTag,
                        {
                          color: colors.text,
                          backgroundColor: colors.backgroundTertiary,
                        },
                      ]}
                    >
                      KO
                    </GameText>
                  ) : null}
                </View>
              ) : (
                <View />
              )}
              {date ? (
                <GameText
                  variant="caption"
                  style={[styles.date, { color: colors.textTertiary }]}
                >
                  {date}
                </GameText>
              ) : null}
            </View>
            {canLeaveBattleStatus(item.status) ? (
              <BattleLeaveAction
                battle={item}
                userId={userId}
                color={colors.error}
                onLeft={() => {
                  // Optimistic removal makes a successful leave visible before
                  // the refetch round-trip. The server remains authoritative.
                  setBattles((current) =>
                    current.filter((battle) => battle.id !== item.id),
                  );
                  void loadBattles();
                }}
              />
            ) : null}
          </View>
        </Pressable>
        {opponentId && !identity.isBot ? (
          <PlayerSafetyActions profileId={opponentId} name={name} />
        ) : null}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: BattleListSection }) => (
    <View
      style={[styles.sectionHeader, { backgroundColor: colors.background }]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={battleSectionLabel(section)}
    >
      <GameText
        variant="title"
        style={[styles.sectionTitle, { color: colors.textSecondary }]}
      >
        {section.title}
      </GameText>
      <GameText
        variant="body"
        style={[
          styles.sectionCount,
          NumericFontVariant,
          { color: colors.textTertiary },
        ]}
      >
        {section.data.length}
      </GameText>
    </View>
  );

  const errorBanner = (
    <View style={styles.bannerWrap}>
      <InlineBanner
        tone="error"
        text="Couldn’t load your battles."
        actionLabel="Retry"
        onAction={() => void loadBattles()}
      />
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + Spacing.sm,
        },
      ]}
    >
      <GameHeader title="Battles" style={{ marginBottom: 16 }} />
      {isLoading ? (
        <ListSkeleton label="Loading your battles" />
      ) : (
        <SectionList
          sections={sections}
          renderItem={renderBattle}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: tabClearance },
            sections.length === 0 && styles.listEmpty,
          ]}
          // A failed refresh over an existing list keeps the rows and says so.
          ListHeaderComponent={
            loadError && sections.length > 0 ? errorBanner : null
          }
          ListEmptyComponent={
            loadError ? (
              errorBanner
            ) : (
              <View style={styles.emptyState}>
                <Image
                  source={UiArt.clash}
                  style={styles.emptyArt}
                  resizeMode="cover"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <GameText
                  variant="title"
                  style={[styles.emptyTitle, { color: colors.text }]}
                >
                  No battles yet
                </GameText>
                <GameText
                  variant="body"
                  style={[
                    styles.emptyText,
                    accessibleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Your battles and results will show up here.
                </GameText>
                <GameButton
                  style={[styles.emptyCta, { backgroundColor: colors.primary }]}
                  onPress={openBattleSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Start a battle"
                  tone="primary"
                  label="Start a battle"
                />
              </View>
            )
          }
          onViewableItemsChanged={onViewableItemsChanged}
          extraData={visibleIds}
          ListFooterComponent={
            nextCursor ? (
              <GameButton
                accessibilityRole="button"
                disabled={loadingMore}
                onPress={() => void loadMore()}
                style={styles.emptyCta}
                tone="secondary"
                label={loadingMore ? 'Loading…' : 'Load older battles'}
              />
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
  },
  list: {
    paddingBottom: Spacing.lg,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  bannerWrap: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  battleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  battleBody: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  battleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  opponent: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  status: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  meta: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  stackedBody: { flex: 0, width: '100%' },
  stackedOpponent: { flex: 0, width: '100%' },
  stackedCard: { flexDirection: 'column', alignItems: 'flex-start' },
  stackedHeader: { flexDirection: 'column', alignItems: 'flex-start' },
  stackedFooter: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  battleFooter: {
    flexWrap: 'wrap',
    columnGap: Spacing.sm,
    rowGap: Spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLeaveAction: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    marginLeft: -Spacing.sm,
    marginTop: Spacing.xs,
  },
  rowLeaveText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textDecorationLine: 'underline',
  },
  outcomeRow: {
    flexWrap: 'wrap',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  result: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  series: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginLeft: Spacing.xs,
  },
  koTag: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginLeft: Spacing.xs,
  },
  date: {
    fontSize: Typography.sizes.sm,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyArt: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  emptyText: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
  emptyCta: {
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  emptyCtaText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});
