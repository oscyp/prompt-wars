import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  AccessibilityInfo,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
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
import { useBattleAudio } from '@/providers/BattleAudioProvider';
import HPBar from '@/components/HPBar';
import HeaderLeaveButton from '@/components/HeaderLeaveButton';
import AnimatedCounter from '@/components/AnimatedCounter';
import SeriesScoreIndicator, {
  orientSeriesScore,
} from '@/components/SeriesScoreIndicator';
import RoundResultCinematic, {
  Tier0Payload,
} from '@/components/RoundResultCinematic';
import RubricBars from '@/components/RubricBars';
import { BattleRound, RubricScoreSet } from '@/types/battle';
import { BattleMode, MoveType } from '@/utils/battles';
import {
  moveLabel,
  roundOutcomeCopy,
  roundOutcomeFor,
} from '@/utils/battleCopy';
import { MOVE_META } from '@/constants/MoveTypes';
import {
  RESULT_LOAD_TIMEOUT_MS,
  fighterNameFor,
  formatPct,
  judgeNotesUnavailable,
  moveMatchupLine,
} from '@/utils/resultView';

/** Header offset shared with move-select / prompt-entry under the transparent header. */
const HEADER_OFFSET = 44;

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

  const roundNumber = round ? Number(round) : current_round;
  const roundData: BattleRound | null = useMemo(() => {
    return rounds.find((r) => r.round_number === roundNumber) ?? null;
  }, [rounds, roundNumber]);

  const roundVideoJob = roundNumber
    ? (videoJobsByRound[roundNumber] ?? null)
    : null;

  const prevRound: BattleRound | null = useMemo(() => {
    if (!roundNumber || roundNumber <= 1) return null;
    return rounds.find((r) => r.round_number === roundNumber - 1) ?? null;
  }, [rounds, roundNumber]);

  const myId = user?.id ?? null;
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

  const myHpAfter = isPlayerOne
    ? (roundData?.player_one_hp_after ?? null)
    : (roundData?.player_two_hp_after ?? null);
  const oppHpAfter = isPlayerOne
    ? (roundData?.player_two_hp_after ?? null)
    : (roundData?.player_one_hp_after ?? null);

  const myHpMax = isPlayerOne ? hp_max.p1 : hp_max.p2;
  const oppHpMax = isPlayerOne ? hp_max.p2 : hp_max.p1;

  const myHpBefore = (() => {
    if (prevRound) {
      const v = isPlayerOne
        ? prevRound.player_one_hp_after
        : prevRound.player_two_hp_after;
      return v ?? myHpMax;
    }
    return myHpMax;
  })();
  const oppHpBefore = (() => {
    if (prevRound) {
      const v = isPlayerOne
        ? prevRound.player_two_hp_after
        : prevRound.player_one_hp_after;
      return v ?? oppHpMax;
    }
    return oppHpMax;
  })();

  const myDamage = isPlayerOne
    ? (roundData?.player_one_damage ?? 0)
    : (roundData?.player_two_damage ?? 0);
  const oppDamage = isPlayerOne
    ? (roundData?.player_two_damage ?? 0)
    : (roundData?.player_one_damage ?? 0);

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

  // Fighter names when the reveal payload carries them; "You"/"Opponent" for
  // payloads that predate `character_name`.
  const myName = fighterNameFor(
    tier0,
    isPlayerOne ? 'player_one' : 'player_two',
    'You',
  );
  const oppName = fighterNameFor(
    tier0,
    isPlayerOne ? 'player_two' : 'player_one',
    'Opponent',
  );

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
  const leave = useBattleExitGuard(battleId || null, {
    format,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot: Boolean(battle?.is_player_two_bot),
    prompts,
    myProfileId: user?.id,
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
      : `/(battle)/move-select?battleId=${battleId}&round=${(roundNumber ?? 1) + 1}`;
    exitTo(() => router.replace(href as Parameters<typeof router.replace>[0]));
  }, [battleId, isSeriesComplete, roundNumber, router, exitTo]);

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

  const headerOptions = {
    headerLeft: () => (
      <HeaderLeaveButton
        onPress={() => leave.confirmLeave()}
        disabled={leave.isLeaving}
      />
    ),
  };

  const enteringAt = (delay: number) =>
    reduceMotion
      ? undefined
      : FadeInDown.duration(Motion.durations.base).delay(delay);

  if (!battle || !roundData) {
    return (
      <View
        style={[
          styles.center,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + HEADER_OFFSET,
          },
        ]}
      >
        <Stack.Screen options={headerOptions} />
        {loadTimedOut ? (
          <View style={styles.errorState} accessibilityLiveRegion="polite">
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color={colors.error}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <Text
              style={[styles.errorTitle, { color: colors.text }]}
              accessibilityRole="header"
            >
              Couldn’t load this round
            </Text>
            <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
              Check your connection and try again.
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={styles.retryText}>Retry</Text>
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
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen options={headerOptions} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + HEADER_OFFSET,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
      >
        {/* Outcome banner: the verdict first, in words, colour and shape. */}
        <Animated.View
          style={[styles.banner, { backgroundColor: colors.card }]}
          entering={enteringAt(0)}
        >
          <View style={styles.bannerRow}>
            {outcome === 'won' ? (
              <Ionicons
                name="trophy"
                size={32}
                color={outcomeColor}
                accessibilityLabel="Trophy"
              />
            ) : outcome === 'lost' ? (
              <MaterialCommunityIcons
                name="heart-broken"
                size={32}
                color={outcomeColor}
                accessibilityLabel="Broken heart"
              />
            ) : outcome === 'draw' ? (
              <MaterialCommunityIcons
                name="handshake"
                size={32}
                color={outcomeColor}
                accessibilityLabel="Handshake"
              />
            ) : (
              <ActivityIndicator color={outcomeColor} />
            )}
            <View style={styles.bannerText}>
              <Text
                accessibilityRole="header"
                style={[
                  styles.heading,
                  NumericFontVariant,
                  { color: outcomeColor },
                ]}
              >
                {outcomeCopy.title}
              </Text>
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
          />
        </Animated.View>

        {/* The series reveal on the result screen takes over the cinematic
            role once the series is decided; a second poster here would be
            the same image twice in a row. */}
        {!isSeriesComplete ? (
          <Animated.View entering={enteringAt(60)}>
            <RoundResultCinematic
              tier0Payload={tier0}
              videoJob={roundVideoJob}
              isModerationApproved={roundVideoJob?.status === 'succeeded'}
              context="round"
            />
          </Animated.View>
        ) : null}

        <Animated.View
          style={[styles.card, { backgroundColor: colors.card }]}
          entering={enteringAt(120)}
        >
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            accessibilityRole="header"
          >
            HP
          </Text>
          <View style={styles.hpRow}>
            <View style={styles.hpCol}>
              <HPBar
                current={myHpAfter ?? myHpBefore}
                max={myHpMax}
                animateFrom={myHpBefore}
                side="left"
                playerName={myName}
              />
            </View>
            <View style={styles.hpCol}>
              <HPBar
                current={oppHpAfter ?? oppHpBefore}
                max={oppHpMax}
                animateFrom={oppHpBefore}
                side="right"
                playerName={oppName}
              />
            </View>
          </View>
        </Animated.View>

        {myMove && oppMove ? (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={enteringAt(180)}
          >
            <Text
              style={[styles.cardTitle, { color: colors.text }]}
              accessibilityRole="header"
            >
              Round modifiers
            </Text>
            {/* The opponent's move, in its own colour and glyph: the stripe used
                to be coloured by which SEAT the viewer sat in, not by the move. */}
            <View
              style={styles.stripeRow}
              accessible
              accessibilityLabel={`They chose ${moveLabel(oppMove)}`}
            >
              <View
                style={[styles.stripe, { backgroundColor: colors[oppMove] }]}
              />
              <Ionicons
                name={MOVE_META[oppMove].icon}
                size={18}
                color={colors[oppMove]}
              />
              <Text
                style={[styles.body, styles.stripeText, { color: colors.text }]}
              >
                They chose{' '}
                <Text style={{ fontWeight: Typography.weights.bold }}>
                  {moveLabel(oppMove)}
                </Text>
              </Text>
            </View>
            <Text
              style={[styles.body, NumericFontVariant, { color: colors.text }]}
            >
              {moveMatchupLine(myMove, oppMove, myMoveMod)}
            </Text>
            <Text
              style={[styles.body, NumericFontVariant, { color: colors.text }]}
            >
              Stat modifier · {formatPct(myStatMod)}
            </Text>
            {oppDamage > 0 ? (
              <View style={styles.damageRow}>
                <Text style={[styles.body, { color: colors.success }]}>
                  Damage dealt:{' '}
                </Text>
                <AnimatedCounter
                  value={oppDamage}
                  style={[styles.body, { color: colors.success }]}
                  accessibilityLabel={`Damage dealt: ${oppDamage}`}
                />
              </View>
            ) : null}
            {myDamage > 0 ? (
              <View style={styles.damageRow}>
                <Text style={[styles.body, { color: colors.error }]}>
                  Damage taken:{' '}
                </Text>
                <AnimatedCounter
                  value={myDamage}
                  style={[styles.body, { color: colors.error }]}
                  accessibilityLabel={`Damage taken: ${myDamage}`}
                />
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {Object.keys(myScores).length > 0 ? (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={enteringAt(240)}
          >
            <Text
              style={[styles.cardTitle, { color: colors.text }]}
              accessibilityRole="header"
            >
              Scores
            </Text>
            <Text style={[styles.caption, { color: colors.textSecondary }]}>
              Six things the judge scores, 0–10.
            </Text>
            <RubricBars scores={myScores} opponentScores={oppScores} />
          </Animated.View>
        ) : null}

        <Animated.View
          style={[styles.card, { backgroundColor: colors.card }]}
          entering={enteringAt(300)}
        >
          <Text
            style={[styles.cardTitle, { color: colors.text }]}
            accessibilityRole="header"
          >
            Judge’s verdict
          </Text>
          <Text style={[styles.explanation, { color: colors.textSecondary }]}>
            {explanation || judgeNotesUnavailable('round')}
          </Text>
        </Animated.View>

        <TouchableOpacity
          style={[
            styles.cta,
            {
              backgroundColor: isResultReady
                ? colors.primary
                : colors.backgroundTertiary,
            },
          ]}
          onPress={handleContinue}
          disabled={!isResultReady}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isResultReady }}
          accessibilityLabel={
            isSeriesComplete
              ? 'See the series reveal'
              : `Continue to round ${(roundNumber ?? 1) + 1}`
          }
        >
          <Text
            style={[
              styles.ctaText,
              { color: isResultReady ? '#FFFFFF' : colors.textSecondary },
            ]}
          >
            {isSeriesComplete
              ? 'See the series reveal'
              : `Continue to round ${(roundNumber ?? 1) + 1}`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: Typography.sizes.base,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  content: {
    padding: Spacing.lg,
  },
  banner: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
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
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  caption: {
    fontSize: Typography.sizes.sm,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xs,
  },
  explanation: {
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * 1.4,
  },
  hpRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  hpCol: {
    flex: 1,
  },
  damageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stripeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stripe: {
    width: 4,
    height: 28,
    borderRadius: 2,
  },
  stripeText: {
    marginBottom: 0,
  },
  cta: {
    height: 56,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  ctaText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
});
