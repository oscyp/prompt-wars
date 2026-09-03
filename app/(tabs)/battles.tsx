import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  getBattleHistory,
  groupBattlesForList,
  battleSectionLabel,
  describeBattleRow,
  battleRouteFor,
  statusToneColor,
  seriesScoreFor,
  seriesLabel,
  opponentProfileIds,
  type BattleListRow,
  type BattleListSection,
} from '@/utils/battleLists';
import { modeLabel, type BattleOutcome } from '@/utils/battleCopy';
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
import { InlineBanner, PortraitPreview } from '@/components';
import { useBattleSheet } from '@/components/BattleModeSheet';
import ListSkeleton from '@/components/ListSkeleton';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const FOCUS_REFETCH_DEBOUNCE_MS = 1500;
const HISTORY_LIMIT = 50;
const AVATAR_SIZE = 44;
/** Rows with nowhere to go (timed out, cancelled) read as inert. */
const DISABLED_ROW_OPACITY = 0.6;

interface OutcomePresentation {
  word: string;
  icon: IoniconName;
  color: string;
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
  const [battles, setBattles] = useState<BattleListRow[]>([]);
  const [players, setPlayers] = useState<PublicPlayerMap>(() => new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastLoadRef = useRef(0);

  const loadBattles = useCallback(async () => {
    lastLoadRef.current = Date.now();
    try {
      const data = await getBattleHistory(HISTORY_LIMIT);
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
    const art =
      archetypeIllustrationUri(identity.isBot ? null : identity.archetype) ??
      '';
    const ring =
      !identity.isBot && identity.signatureColor
        ? resolveSignatureHex(identity.signatureColor)
        : colors.border;
    // Series score and knockout only once there is a result to score.
    const series = outcome ? seriesScoreFor(item, userId) : null;
    const knockout = Boolean(outcome) && item.is_ko === true;
    const date = shortDate(item.created_at);
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

    return (
      <Pressable
        style={({ pressed }) => [
          styles.battleCard,
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
        <PortraitPreview
          uri={art}
          variant="circle"
          size={AVATAR_SIZE}
          accentColor={ring}
          accessibilityLabel={`${name}'s archetype`}
        />
        <View style={styles.battleBody}>
          <View style={styles.battleHeader}>
            <Text
              style={[styles.opponent, accessibleText, { color: colors.text }]}
              numberOfLines={1}
            >
              vs {name}
            </Text>
            {showChip ? (
              <View
                style={[
                  styles.statusChip,
                  chipFilled
                    ? { backgroundColor: toneColor, borderColor: toneColor }
                    : { borderColor: toneColor },
                ]}
              >
                <Text
                  style={[
                    styles.status,
                    { color: chipFilled ? inkFor(toneColor) : toneColor },
                  ]}
                >
                  {view.status.label}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              styles.meta,
              accessibleText,
              { color: colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {item.theme ? `${mode} · ${item.theme}` : mode}
          </Text>
          <View style={styles.battleFooter}>
            {outcome ? (
              <View style={styles.outcomeRow}>
                <Ionicons name={outcome.icon} size={14} color={outcome.color} />
                <Text style={[styles.result, { color: outcome.color }]}>
                  {outcome.word}
                </Text>
                {series ? (
                  <Text
                    style={[
                      styles.series,
                      NumericFontVariant,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {seriesLabel(series)}
                  </Text>
                ) : null}
                {knockout ? (
                  <Text
                    style={[
                      styles.koTag,
                      {
                        color: colors.text,
                        backgroundColor: colors.backgroundTertiary,
                      },
                    ]}
                  >
                    KO
                  </Text>
                ) : null}
              </View>
            ) : (
              <View />
            )}
            {date ? (
              <Text style={[styles.date, { color: colors.textTertiary }]}>
                {date}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }: { section: BattleListSection }) => (
    <View
      style={[styles.sectionHeader, { backgroundColor: colors.background }]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={battleSectionLabel(section)}
    >
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        {section.title}
      </Text>
      <Text
        style={[
          styles.sectionCount,
          NumericFontVariant,
          { color: colors.textTertiary },
        ]}
      >
        {section.data.length}
      </Text>
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
      <Text
        style={[styles.title, { color: colors.text }]}
        accessibilityRole="header"
      >
        Battles
      </Text>
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
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No battles yet
                </Text>
                <Text
                  style={[
                    styles.emptyText,
                    accessibleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Your battles and results will show up here.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { backgroundColor: colors.primary }]}
                  onPress={openBattleSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Start a battle"
                >
                  <Text
                    style={[
                      styles.emptyCtaText,
                      { color: inkFor(colors.primary) },
                    ]}
                  >
                    Start a battle
                  </Text>
                </TouchableOpacity>
              </View>
            )
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
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  battleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  battleBody: {
    flex: 1,
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
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  meta: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.xs,
  },
  battleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  outcomeRow: {
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
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginLeft: Spacing.xs,
  },
  date: {
    fontSize: Typography.sizes.xs,
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
