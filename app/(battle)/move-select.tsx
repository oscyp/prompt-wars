import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import {
  getBattle,
  getOpponentMoveProfile,
  MoveType,
  OpponentMoveProfile,
} from '@/utils/battles';
import { MOVE_META, counterOf } from '@/constants/MoveTypes';
import { hapticSelection } from '@/utils/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import HPBar from '@/components/HPBar';
import MoveTypeChipRow from '@/components/MoveTypeChipRow';
import MoveTypeSelector from '@/components/MoveTypeSelector';
import VersusStrip from '@/components/VersusStrip';

/**
 * Screen A of the arena: pick a move type.
 *
 * Split out of prompt-entry so the two decisions stop competing for one
 * screen. This one is strategic and reversible -- read the opponent's pattern,
 * weigh the matchup, change your mind. Screen B is the writing and the
 * irreversible lock-in, which is why the press-and-hold ceremony lives there
 * and this footer is a plain Continue.
 *
 * Navigation is push, not replace, so `router.back()` from prompt-entry
 * returns here with the selection intact.
 */
export default function MoveSelectScreen() {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { battleId, round } = useLocalSearchParams<{
    battleId: string;
    round?: string;
  }>();

  const [battle, setBattle] = useState<{ theme?: string | null } | null>(null);
  const [oppProfile, setOppProfile] = useState<OpponentMoveProfile | null>(null);
  const [moveType, setMoveType] = useState<MoveType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const {
    battle: rtBattle,
    prompts,
    rounds,
    format,
    current_round,
    series_score,
    hp,
    hp_max,
  } = useRealtimeBattle(battleId || null);

  const roundNumber = round ? Number(round) : current_round;

  // Derive the round from the number THIS SCREEN is showing, not from
  // battle.current_round.
  //
  // The hook's `current_round_data` is keyed strictly off `battle.current_round`,
  // but this screen takes its round from the `?round=` param. Right after
  // round-result navigates to round N+1 the server has not advanced yet, so
  // `current_round` is still N -- and the countdown and the "opponent locked
  // in" indicator described the previous round while the player wrote for the
  // next one. round-result.tsx already derives correctly; this mirrors it.
  const roundData = useMemo(
    () => rounds.find((r) => r.round_number === roundNumber) ?? null,
    [rounds, roundNumber],
  );
  const isBo3 = format === 'bo3';

  const isPlayerOne = rtBattle?.player_one_id === user?.id;
  const myHp = isPlayerOne ? hp.p1 : hp.p2;
  const myHpMax = isPlayerOne ? hp_max.p1 : hp_max.p2;
  const oppHp = isPlayerOne ? hp.p2 : hp.p1;
  const oppHpMax = isPlayerOne ? hp_max.p2 : hp_max.p1;

  // Opponent's last 5 move types across rounds (from battle_prompts).
  const opponentHistory = useMemo<MoveType[]>(() => {
    if (!rtBattle || !user) return [];
    const opp = prompts
      .filter((p) => p.profile_id !== user.id && p.move_type)
      .sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))
      .map((p) => p.move_type as MoveType);
    return opp.slice(-5);
  }, [prompts, rtBattle, user]);

  const { p1: p1Char, p2: p2Char } = useBattleCharacters(
    battleId || null,
    rtBattle,
  );
  const myChar = isPlayerOne ? p1Char : p2Char;
  const oppChar = isPlayerOne ? p2Char : p1Char;

  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    getOpponentMoveProfile(battleId as string).then((profile) => {
      if (!cancelled) setOppProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  useEffect(() => {
    if (!battleId) {
      Alert.alert('Error', 'No battle ID');
      router.back();
      return;
    }
    let cancelled = false;
    getBattle(battleId as string)
      .then((data) => {
        if (!cancelled) setBattle(data as { theme?: string | null });
      })
      .catch((err) => {
        console.error('Failed to load battle:', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [battleId, router]);

  const displayedHistory = useMemo<MoveType[]>(
    () =>
      opponentHistory.length > 0
        ? opponentHistory
        : (oppProfile?.recent_moves ?? []),
    [opponentHistory, oppProfile],
  );
  const historyLabel =
    opponentHistory.length > 0
      ? "Opponent's moves this battle"
      : "Opponent's recent moves";

  const suggestedCounter = useMemo<MoveType | null>(() => {
    if (displayedHistory.length === 0) return null;
    const counts: Record<MoveType, number> = {
      attack: 0,
      defense: 0,
      finisher: 0,
    };
    displayedHistory.forEach((m) => {
      counts[m] += 1;
    });
    const mostFrequent = (Object.keys(counts) as MoveType[]).sort(
      (a, b) => counts[b] - counts[a],
    )[0];
    return counterOf(mostFrequent);
  }, [displayedHistory]);

  const myDeadline = isBo3
    ? (roundData?.lock_in_deadline ?? null)
    : isPlayerOne
      ? (rtBattle?.player_one_prompt_deadline ?? null)
      : (rtBattle?.player_two_prompt_deadline ?? null);

  const opponentHasLocked = useMemo<boolean>(() => {
    if (!rtBattle) return false;
    if (isBo3) {
      const rd = roundData;
      if (!rd) return false;
      return Boolean(
        isPlayerOne ? rd.player_two_locked_at : rd.player_one_locked_at,
      );
    }
    return Boolean(
      isPlayerOne
        ? rtBattle.player_two_locked_at
        : rtBattle.player_one_locked_at,
    );
  }, [rtBattle, isBo3, roundData, isPlayerOne]);

  const handleContinue = () => {
    if (!moveType) return;
    hapticSelection();
    // push, not replace: back from prompt-entry must return here.
    router.push(
      `/(battle)/prompt-entry?battleId=${battleId}&round=${roundNumber}&moveType=${moveType}`,
    );
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Pinned battle bar, identical to prompt-entry's so the two screens read
          as one flow rather than two destinations. */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top + 44,
          },
        ]}
      >
        <VersusStrip
          left={{
            name: myChar?.name ?? 'You',
            archetype: myChar?.archetype ?? '',
            signatureColor: myChar?.signatureColor ?? colors.primary,
            portraitUrl: myChar?.portraitUrl,
            cosmetics: myChar?.cosmetics,
            label: 'YOU',
          }}
          right={{
            name: oppChar?.name ?? 'Opponent',
            archetype: oppChar?.archetype ?? '',
            signatureColor: oppChar?.signatureColor ?? colors.textSecondary,
            portraitUrl: oppChar?.portraitUrl,
            cosmetics: oppChar?.cosmetics,
            label: 'OPPONENT',
          }}
          subtitle={isBo3 ? `Round ${roundNumber}` : null}
          deadline={myDeadline}
        />

        {battle?.theme ? (
          <View style={[styles.themeBar, { backgroundColor: colors.card }]}>
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={[styles.themeBarLabel, { color: colors.textTertiary }]}>
              THEME
            </Text>
            <Text
              style={[
                styles.themeBarText,
                { color: colors.primary },
                accessibleText,
              ]}
              numberOfLines={2}
            >
              {battle.theme}
            </Text>
          </View>
        ) : null}

        {opponentHasLocked ? (
          <View
            style={[
              styles.opponentLockedBanner,
              { backgroundColor: colors.card, borderColor: colors.warning },
            ]}
            accessible
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel="Opponent has locked in. Your move."
          >
            <Ionicons name="lock-closed" size={14} color={colors.warning} />
            <Text style={[styles.opponentLockedText, { color: colors.text }]}>
              Opponent has locked in — your move
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {isBo3 ? (
          <>
            <SeriesScoreIndicator
              score={series_score}
              currentRound={roundNumber}
              format={format}
              bestOf={rtBattle?.best_of ?? 3}
            />
            <View style={styles.hpRow}>
              <View style={styles.hpCol}>
                <HPBar
                  current={myHp}
                  max={myHpMax}
                  side="left"
                  playerName="You"
                  compact
                />
              </View>
              <View style={styles.hpCol}>
                <HPBar
                  current={oppHp}
                  max={oppHpMax}
                  side="right"
                  playerName="Opponent"
                  compact
                />
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.text }]}>
            Choose your move
          </Text>
          {displayedHistory.length > 0 ? (
            <MoveTypeChipRow history={displayedHistory} label={historyLabel} />
          ) : null}

          <MoveTypeSelector
            value={moveType}
            onChange={setMoveType}
            suggestedCounter={suggestedCounter}
          />

          {/* Matchup detail only appears once a move is picked -- showing all
              three at once was the noise this split exists to remove. */}
          {moveType ? (
            <>
              <View
                style={[styles.matchupHint, { backgroundColor: colors.card }]}
                accessible
                accessibilityLabel={`${moveType} beats ${MOVE_META[moveType].beats}, loses to ${MOVE_META[moveType].losesTo}`}
              >
                <Ionicons name="trending-up" size={14} color={colors.success} />
                <Text
                  style={[styles.matchupText, { color: colors.textSecondary }]}
                >
                  beats{' '}
                  <Text
                    style={{
                      color: colors[MOVE_META[moveType].beats],
                      fontWeight: Typography.weights.bold,
                    }}
                  >
                    {MOVE_META[moveType].beats.toUpperCase()}
                  </Text>
                </Text>
                <View
                  style={[
                    styles.matchupDivider,
                    { backgroundColor: colors.border },
                  ]}
                />
                <Ionicons name="trending-down" size={14} color={colors.error} />
                <Text
                  style={[styles.matchupText, { color: colors.textSecondary }]}
                >
                  loses to{' '}
                  <Text
                    style={{
                      color: colors[MOVE_META[moveType].losesTo],
                      fontWeight: Typography.weights.bold,
                    }}
                  >
                    {MOVE_META[moveType].losesTo.toUpperCase()}
                  </Text>
                </Text>
              </View>

              {(() => {
                const rate = oppProfile?.counter_win_rates?.[moveType];
                const archetype = oppProfile?.opponent_archetype;
                if (!rate || !archetype || rate.total < 3) return null;
                return (
                  <Text
                    style={[styles.winRateText, { color: colors.textTertiary }]}
                  >
                    {moveType.toUpperCase()} wins{' '}
                    {Math.round(rate.win_rate * 100)}% vs{' '}
                    {archetype.toUpperCase()} ({rate.total} battles)
                  </Text>
                );
              })()}
            </>
          ) : (
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              Attack beats finisher, defense beats attack, finisher beats
              defense. Your writing still decides most rounds.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Plain Continue: nothing here is irreversible, so nothing here earns a
          hold ceremony. That belongs on lock-in. */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + Spacing.sm,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: moveType ? colors.primary : colors.card },
          ]}
          onPress={handleContinue}
          disabled={!moveType}
          accessibilityLabel={
            moveType ? `Continue with ${moveType}` : 'Choose a move type first'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !moveType }}
        >
          <Text
            style={[
              styles.continueText,
              { color: moveType ? '#FFFFFF' : colors.textTertiary },
            ]}
          >
            {moveType ? `Continue with ${moveType.toUpperCase()}` : 'Choose a move'}
          </Text>
          {moveType ? (
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hpRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  hpCol: {
    flex: 1,
  },
  themeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  themeBarLabel: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  themeBarText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  opponentLockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  opponentLockedText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
  },
  section: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  label: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  hint: {
    fontSize: Typography.sizes.xs,
    lineHeight: 18,
  },
  matchupHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  matchupText: {
    fontSize: Typography.sizes.xs,
  },
  matchupDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    marginHorizontal: Spacing.xs,
  },
  winRateText: {
    fontSize: Typography.sizes.xs,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  continueText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
});
