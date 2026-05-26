import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useAuth } from '@/providers/AuthProvider';
import HPBar from '@/components/HPBar';
import RoundResultCinematic, {
  Tier0Payload,
} from '@/components/RoundResultCinematic';
import RubricBars from '@/components/RubricBars';
import { BattleRound, RubricScoreSet } from '@/types/battle';
import { MoveType } from '@/utils/battles';

export default function RoundResultScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { battleId, round } = useLocalSearchParams<{
    battleId: string;
    round?: string;
  }>();

  const {
    battle,
    rounds,
    videoJobsByRound,
    hp_max,
    current_round,
  } = useRealtimeBattle(battleId || null);

  const roundNumber = round ? Number(round) : current_round;
  const roundData: BattleRound | null = useMemo(() => {
    return rounds.find((r) => r.round_number === roundNumber) ?? null;
  }, [rounds, roundNumber]);

  const roundVideoJob = roundNumber ? videoJobsByRound[roundNumber] ?? null : null;

  const prevRound: BattleRound | null = useMemo(() => {
    if (!roundNumber || roundNumber <= 1) return null;
    return rounds.find((r) => r.round_number === roundNumber - 1) ?? null;
  }, [rounds, roundNumber]);

  const isPlayerOne = battle?.player_one_id === user?.id;

  const myScores = useMemo<Partial<RubricScoreSet>>(() => {
    const j = roundData?.judge_payload;
    if (!j) return {};
    return (isPlayerOne
      ? j.player_one_normalized_scores
      : j.player_two_normalized_scores) ?? {};
  }, [roundData, isPlayerOne]);

  const oppScores = useMemo<Partial<RubricScoreSet>>(() => {
    const j = roundData?.judge_payload;
    if (!j) return {};
    return (isPlayerOne
      ? j.player_two_normalized_scores
      : j.player_one_normalized_scores) ?? {};
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

  const explanation = roundData?.judge_payload?.explanation ?? '';
  const tier0 = (battle?.tier0_reveal_payload as Tier0Payload | null) ?? null;

  const isResultReady = roundData?.status === 'result_ready';
  const isSeriesComplete = battle?.status === 'completed';

  const handleContinue = useCallback(() => {
    if (!battleId) return;
    if (isSeriesComplete) {
      router.replace(`/(battle)/result?battleId=${battleId}`);
    } else {
      const next = (roundNumber ?? 1) + 1;
      router.replace(
        `/(battle)/prompt-entry?battleId=${battleId}&round=${next}`,
      );
    }
  }, [battleId, isSeriesComplete, roundNumber, router]);

  if (!battle || !roundData) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loading, { color: colors.textSecondary }]}>
          Loading round result…
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.text }]}>
          Round {roundData.round_number} Result
        </Text>

        <RoundResultCinematic
          tier0Payload={tier0}
          videoJob={roundVideoJob}
          isModerationApproved={roundVideoJob?.moderation_status === 'approved'}
        />

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            HP Change
          </Text>
          <View style={styles.hpRow}>
            <View style={styles.hpCol}>
              <HPBar
                current={myHpAfter ?? myHpBefore}
                max={myHpMax}
                animateFrom={myHpBefore}
                side="left"
                playerName="You"
              />
            </View>
            <View style={styles.hpCol}>
              <HPBar
                current={oppHpAfter ?? oppHpBefore}
                max={oppHpMax}
                animateFrom={oppHpBefore}
                side="right"
                playerName="Opponent"
              />
            </View>
          </View>
        </View>

        {myMove && oppMove ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Modifiers
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>
              Your{' '}
              <Text style={{ fontWeight: Typography.weights.bold }}>
                {myMove}
              </Text>{' '}
              vs their{' '}
              <Text style={{ fontWeight: Typography.weights.bold }}>
                {oppMove}
              </Text>{' '}
              ({formatPct(myMoveMod)} move bonus)
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>
              Stat modifier: {formatPct(myStatMod)}
            </Text>
            {oppDamage > 0 ? (
              <Text style={[styles.body, { color: colors.success }]}>
                Damage dealt: {oppDamage}
              </Text>
            ) : null}
            {myDamage > 0 ? (
              <Text style={[styles.body, { color: colors.error }]}>
                Damage taken: {myDamage}
              </Text>
            ) : null}
          </View>
        ) : null}

        {Object.keys(myScores).length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Rubric Breakdown
            </Text>
            <RubricBars scores={myScores} opponentScores={oppScores} />
          </View>
        ) : null}

        {explanation ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Judge's Reasoning
            </Text>
            <Text style={[styles.explanation, { color: colors.textSecondary }]}>
              {explanation}
            </Text>
          </View>
        ) : null}

        {oppMove ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Opponent Recap
            </Text>
            <View style={styles.stripeRow}>
              <View
                style={[
                  styles.stripe,
                  {
                    backgroundColor:
                      (battle.player_two_id === user?.id
                        ? colors.attack
                        : colors.defense),
                  },
                ]}
              />
              <Text style={[styles.body, { color: colors.text }]}>
                They chose{' '}
                <Text style={{ fontWeight: Typography.weights.bold }}>
                  {oppMove}
                </Text>
              </Text>
            </View>
          </View>
        ) : null}

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
              ? 'View series result'
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
              ? 'View Series Result'
              : `Continue to Round ${(roundNumber ?? 1) + 1}`}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '0%';
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
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
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  heading: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.md,
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
  stripeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stripe: {
    width: 4,
    height: 28,
    borderRadius: 2,
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
