import { leaveActionLabel, hasOpponent } from '@/utils/battles';
import BattleHeader from '@/components/battle/BattleHeader';
import BattleBackdrop from '@/components/battle/BattleBackdrop';
import RoundImpact from '@/components/battle/RoundImpact';
import RoundScorePanel from '@/components/battle/RoundScorePanel';
import RoundDetails from '@/components/battle/RoundDetails';
import RoundMoveReview from '@/components/battle/RoundMoveReview';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import {
  GameText as Text,
  GameFooter,
  GameButton,
  GamePanel,
} from '@/components/game';
import { inkFor } from '@/utils/contrast';
import BattleOpponentSafety from '@/components/BattleOpponentSafety';
import {
  isUnratedExhibition,
  EXHIBITION_EXPLANATION,
} from '@/utils/battleExplanation';
import { exactBattleDeadline } from '@/utils/battleCopy';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  Motion,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import {
  hapticDefeat,
  hapticDraw,
  hapticHpLoss,
  hapticVictory,
} from '@/utils/haptics';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useBattleExitGuard } from '@/hooks/useBattleExitGuard';
import { useAuth } from '@/providers/AuthProvider';
import { useComposerResultTelemetry } from '@/hooks/useComposerResultTelemetry';
import { useBattleAudio } from '@/providers/BattleAudioProvider';
import SeriesScoreIndicator, {
  orientSeriesScore,
} from '@/components/SeriesScoreIndicator';
import RoundResultCinematic, {
  Tier0Payload,
} from '@/components/RoundResultCinematic';
import { BattleRound, RubricScoreSet } from '@/types/battle';
import { BattleMode, MoveType } from '@/utils/battles';
import { roundOutcomeCopy, roundOutcomeFor } from '@/utils/battleCopy';
import { RESULT_LOAD_TIMEOUT_MS } from '@/utils/resultView';

export default function RoundResultScreen() {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { stopMusic } = useBattleAudio();
  const { battleId, round } = useLocalSearchParams<{
    battleId: string;
    round?: string;
  }>();

  useEffect(() => stopMusic(), [stopMusic]);

  const {
    battle,
    prompts,
    rounds,
    videoJobsByRound,
    hp_max,
    current_round,
    format,
    series_score,
    refetch,
  } = useRealtimeBattle(battleId || null);

  const { p1: fighterOne, p2: fighterTwo } = useBattleCharacters(
    battleId || null,
    battle,
  );
  const roundNumber = round ? Number(round) : current_round;
  const roundData: BattleRound | null = useMemo(() => {
    return rounds.find((r) => r.round_number === roundNumber) ?? null;
  }, [rounds, roundNumber]);

  const roundVideoJob = roundNumber
    ? (videoJobsByRound[roundNumber] ?? null)
    : null;

  const myId = user?.id ?? null;
  const trackComposerResult = useComposerResultTelemetry(
    myId,
    battleId,
    battle?.prompt_experience_version === 2,
  );
  const isPlayerOne = Boolean(battle) && battle?.player_one_id === myId;
  const viewer = isPlayerOne ? 'p1' : 'p2';

  const myScores = useMemo<Partial<RubricScoreSet>>(() => {
    const j = roundData?.judge_payload;
    if (!j) return {};
    return (
      (isPlayerOne
        ? j.player_one_normalized_scores
        : j.player_two_normalized_scores) ?? {}
    );
  }, [roundData, isPlayerOne]);

  const oppScores = useMemo<Partial<RubricScoreSet>>(() => {
    const j = roundData?.judge_payload;
    if (!j) return {};
    return (
      (isPlayerOne
        ? j.player_two_normalized_scores
        : j.player_one_normalized_scores) ?? {}
    );
  }, [roundData, isPlayerOne]);

  const myMove: MoveType | null = useMemo(() => {
    const m = roundData?.judge_payload?.move_type_matchup;
    if (!m) return null;
    return (isPlayerOne ? m.player_one : m.player_two) as MoveType;
  }, [roundData, isPlayerOne]);

  const oppMove: MoveType | null = useMemo(() => {
    const m = roundData?.judge_payload?.move_type_matchup;
    if (!m) return null;
    return (isPlayerOne ? m.player_two : m.player_one) as MoveType;
  }, [roundData, isPlayerOne]);

  const myHpMax = isPlayerOne ? hp_max.p1 : hp_max.p2;
  const oppHpMax = isPlayerOne ? hp_max.p2 : hp_max.p1;

  const myDamage = isPlayerOne
    ? (roundData?.player_one_damage ?? 0)
    : (roundData?.player_two_damage ?? 0);
  const myMoveMod = isPlayerOne
    ? (roundData?.move_type_modifier_player_one ?? 0)
    : (roundData?.move_type_modifier_player_two ?? 0);
  const myStatMod = isPlayerOne
    ? (roundData?.stat_modifier_player_one ?? 0)
    : (roundData?.stat_modifier_player_two ?? 0);

  const explanation = roundData?.judge_payload?.explanation?.trim() ?? '';
  const tier0 = (battle?.tier0_reveal_payload as Tier0Payload | null) ?? null;

  const isResultReady = roundData?.status === 'result_ready';
  const isSeriesComplete = battle?.status === 'completed';

  // --- Outcome, from the viewer's side ---------------------------------------
  const { mine, theirs } = orientSeriesScore(series_score, viewer);
  const outcome = roundData
    ? roundOutcomeFor({
        status: roundData.status,
        isDraw: Boolean(roundData.is_draw),
        roundWinnerId: roundData.round_winner_id,
        myProfileId: myId,
        winnerSide: roundData.judge_payload?.combat?.winner,
        viewerSide:
          myId && battle
            ? myId === battle.player_one_id
              ? 1
              : myId === battle.player_two_id
                ? 2
                : null
            : null,
      })
    : 'pending';
  const outcomeCopy = roundOutcomeCopy({
    outcome,
    roundNumber: roundData?.round_number ?? roundNumber ?? 1,
    isKo: Boolean(roundData?.is_ko),
    seriesComplete: isSeriesComplete,
    mine,
    theirs,
  });
  const outcomeColor =
    outcome === 'won'
      ? colors.success
      : outcome === 'lost'
        ? colors.error
        : outcome === 'draw'
          ? colors.warning
          : colors.textSecondary;

  // One haptic and one announcement when the round's verdict first lands. A
  // loss that cost HP keeps the impact haptic; a loss without damage (a draw
  // on points that the server still awarded) gets the plain defeat.
  const outcomeFired = useRef(false);
  useEffect(() => {
    if (outcomeFired.current || outcome === 'pending') return;
    outcomeFired.current = true;
    if (outcome === 'won') hapticVictory();
    else if (outcome === 'lost') {
      if (myDamage > 0) hapticHpLoss();
      else hapticDefeat();
    } else hapticDraw();
    AccessibilityInfo.announceForAccessibility(
      `${outcomeCopy.title}. ${outcomeCopy.subtitle}`,
    );
  }, [outcome, myDamage, outcomeCopy.title, outcomeCopy.subtitle]);

  // Between rounds, back means abandoning the series -- there is no earlier
  // screen to return to.
  const leaveLabel = leaveActionLabel({
    status: battle?.status,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(battle?.is_player_two_bot),
    hasOpponent: Boolean(battle && hasOpponent(battle)),
  });
  const leave = useBattleExitGuard(battleId || null, {
    format,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(battle?.is_player_two_bot),
    prompts,
    myProfileId: user?.id,
    status: battle?.status,
    hasOpponent: Boolean(battle?.player_two_id || battle?.is_player_two_bot),
    enabled: Boolean(battle),
  });
  const { exitTo } = leave;

  // Continuing to the next round is a router.replace, and a replace removes
  // this screen -- which the leave guard would intercept, asking a player
  // whether they want to forfeit every time they advanced the series. exitTo
  // stands the guard down for one render and navigates after it.
  const handleContinue = useCallback(() => {
    if (!battleId) return;
    const href = isSeriesComplete
      ? `/(battle)/result?battleId=${battleId}`
      : `/(battle)/prompt-entry?battleId=${battleId}&round=${(roundNumber ?? 1) + 1}`;
    exitTo(() => router.replace(href as Parameters<typeof router.replace>[0]));
  }, [battleId, isSeriesComplete, roundNumber, router, exitTo]);

  useEffect(() => {
    if (isSeriesComplete && battleId)
      exitTo(() => router.replace(`/(battle)/result?battleId=${battleId}`));
  }, [isSeriesComplete, battleId, exitTo, router]);

  // The hook applies fetch results only `if (res.data)`, so a failed fetch
  // leaves the spinner up with nothing to say. After a while, say something.
  const ready = Boolean(battle && roundData);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    if (ready) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(
      () => setLoadTimedOut(true),
      RESULT_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [ready, retryKey]);

  const handleRetry = useCallback(() => {
    setLoadTimedOut(false);
    setRetryKey((k) => k + 1);
    refetch();
  }, [refetch]);

  const enteringAt = (delay: number) =>
    reduceMotion
      ? undefined
      : FadeInDown.duration(Motion.durations.base).delay(delay);

  if (!battle || !roundData) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <BattleBackdrop theme={battle?.theme} />
        <BattleHeader
          onPark={leave.park}
          onLeave={() => leave.confirmLeave()}
          leaveLabel={leaveLabel}
          leaveDisabled={leave.isLeaving || !leave.canForfeit}
        />
        <View style={styles.center}>
          {loadTimedOut ? (
            <View style={styles.errorState} accessibilityLiveRegion="polite">
              <GameSymbol
                name="alert-circle-outline"
                size={40}
                color={colors.error}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <GameDisplayTitle
                uppercase={false}
                style={[styles.errorTitle]}
                accessibilityRole="header"
              >
                Couldn’t load this round
              </GameDisplayTitle>
              <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
                Check your connection and try again.
              </Text>
              <TouchableOpacity
                style={[
                  styles.retryButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry"
              >
                <Text
                  style={[styles.retryText, { color: inkFor(colors.primary) }]}
                >
                  Retry
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loading, { color: colors.textSecondary }]}>
                Loading round result…
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <BattleBackdrop theme={battle.theme} />
      <BattleHeader
        onPark={leave.park}
        onLeave={() => leave.confirmLeave()}
        leaveLabel={leaveLabel}
        leaveDisabled={leave.isLeaving || !leave.canForfeit}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Spacing.md,
            paddingBottom: Spacing.xl,
          },
        ]}
      >
        {isUnratedExhibition(battle.mode, roundData.judge_payload) ? (
          <Text style={{ color: colors.warning, paddingVertical: 12 }}>
            {EXHIBITION_EXPLANATION}
          </Text>
        ) : null}
        {/* Outcome banner: the verdict first, in words, colour and shape. */}
        <Animated.View entering={enteringAt(0)}>
          <GamePanel tone="ornate" style={{ gap: 16 }}>
            <View style={styles.bannerRow}>
              {outcome === 'won' ? (
                <GameSymbol
                  name="trophy"
                  size={32}
                  color={outcomeColor}
                  accessibilityLabel="Trophy"
                />
              ) : outcome === 'lost' ? (
                <GameIcon name="defeat" size={32} color={outcomeColor} />
              ) : outcome === 'draw' ? (
                <GameIcon name="draw" size={32} color={outcomeColor} />
              ) : (
                <ActivityIndicator color={outcomeColor} />
              )}
              <View style={styles.bannerText}>
                <GameDisplayTitle
                  accessibilityRole="header"
                  style={[
                    styles.heading,
                    NumericFontVariant,
                    { color: outcomeColor },
                  ]}
                >
                  {outcomeCopy.title}
                </GameDisplayTitle>
                <Text
                  style={[
                    styles.subheading,
                    NumericFontVariant,
                    { color: colors.textSecondary },
                  ]}
                >
                  {outcomeCopy.subtitle}
                </Text>
              </View>
            </View>
            <SeriesScoreIndicator
              score={series_score}
              currentRound={roundData.round_number}
              format={format}
              bestOf={battle.best_of ?? 3}
              viewer={viewer}
              framed={false}
            />
          </GamePanel>
        </Animated.View>

        <RoundScorePanel
          round={roundData}
          isPlayerOne={isPlayerOne}
          isPracticeBot={Boolean(battle.is_player_two_bot)}
        />
        <RoundImpact
          round={roundData}
          isPlayerOne={isPlayerOne}
          mine={isPlayerOne ? fighterOne : fighterTwo}
          theirs={isPlayerOne ? fighterTwo : fighterOne}
          myMax={myHpMax}
          theirMax={oppHpMax}
        />

        <Text style={{ color: colors.textSecondary }}>
          {exactBattleDeadline(
            rounds.find((r) => r.round_number === (roundNumber ?? 1) + 1)
              ?.lock_in_deadline,
          )}
        </Text>
        <RoundDetails
          policyVersion={roundData.judge_prompt_version}
          myMove={myMove}
          opponentMove={oppMove}
          moveModifier={myMoveMod}
          statModifier={myStatMod}
          scores={myScores}
          opponentScores={oppScores}
          explanation={explanation}
        />
        {roundData.situation_snapshot &&
        roundData.judge_payload?.frozen_inputs ? (
          <GamePanel tone="quiet" style={{ gap: 12 }}>
            <RoundMoveReview
              round={roundData}
              isPlayerOne={isPlayerOne}
              onOpen={() => {
                if (roundData.judge_payload?.explanation?.trim())
                  trackComposerResult(
                    'composer_explanation_read',
                    roundData.round_number,
                  );
              }}
            />
          </GamePanel>
        ) : null}
        {/* Optional artwork follows the full breakdown; Continue stays pinned. */}
        {!isSeriesComplete ? (
          <Animated.View entering={enteringAt(60)}>
            <RoundResultCinematic
              tier0Payload={tier0}
              portraitUrl={
                (roundData.round_winner_id === battle.player_two_id
                  ? fighterTwo
                  : fighterOne
                )?.fighterUrl
              }
              archetype={
                (roundData.round_winner_id === battle.player_two_id
                  ? fighterTwo
                  : fighterOne
                )?.archetype
              }
              cosmetics={
                (roundData.round_winner_id === battle.player_two_id
                  ? fighterTwo
                  : fighterOne
                )?.cosmetics
              }
              videoJob={roundVideoJob}
              isModerationApproved={roundVideoJob?.status === 'succeeded'}
              context="round"
            />
          </Animated.View>
        ) : null}
        <BattleOpponentSafety battle={battle} myId={myId} />
      </ScrollView>
      <GameFooter style={{ paddingBottom: insets.bottom + Spacing.sm }}>
        <GameButton
          onPress={handleContinue}
          disabled={!isResultReady}
          label={
            isSeriesComplete
              ? 'See the series reveal'
              : `Continue to round ${(roundNumber ?? 1) + 1}`
          }
        />
      </GameFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  loading: {
    marginTop: Spacing.md,
    fontSize: Typography.sizes.base,
  },
  errorState: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.md,
  },
  errorTitle: {
    fontSize: Typography.sizes.xl,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  retryText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  content: {
    paddingHorizontal: 16,
    gap: 20,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  bannerText: {
    flex: 1,
  },
  heading: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  subheading: {
    fontSize: Typography.sizes.base,
    marginTop: 2,
  },
});
