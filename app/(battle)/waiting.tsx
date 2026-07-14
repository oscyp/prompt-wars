import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  Spacing,
  Typography,
  BorderRadius,
  Elevation,
} from '@/constants/DesignTokens';
import { UiArt } from '@/constants/UiArt';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useAuth } from '@/providers/AuthProvider';
import {
  retryBattleResolution,
  startMatchmaking,
  BattleMode,
} from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';

interface BattleRoutingRow {
  format?: string | null;
  player_two_id?: string | null;
  player_two_character_id?: string | null;
  is_player_two_bot?: boolean | null;
  bot_persona_id?: string | null;
}

function hasOpponent(row: BattleRoutingRow | null): boolean {
  if (!row) return false;
  if (row.is_player_two_bot) return Boolean(row.bot_persona_id);
  return Boolean(row.player_two_id && row.player_two_character_id);
}

export default function WaitingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { battleId, round } = useLocalSearchParams<{
    battleId: string;
    round?: string;
  }>();

  const {
    battle,
    prompts,
    isSubscribed,
    format,
    current_round,
    series_score,
    rounds,
  } = useRealtimeBattle(battleId || null);
  const roundNumber = round ? Number(round) : current_round;
  const isBo3 = format === 'bo3';

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hasRetriedResolutionRef = useRef(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const routeMatchedBattle = useCallback(
    async (targetBattleId: string) => {
      const { data: battleRow, error } = await supabase
        .from('battles')
        .select(
          'format, player_two_id, player_two_character_id, is_player_two_bot, bot_persona_id',
        )
        .eq('id', targetBattleId)
        .single();

      const routeRow = (battleRow ?? null) as BattleRoutingRow | null;
      if (error || !hasOpponent(routeRow)) {
        setRetryMessage('Match is preparing opponent details...');
        return false;
      }

      router.replace(`/(battle)/face-off?battleId=${targetBattleId}`);
      return true;
    },
    [router],
  );

  // Filter prompts to the current round when bo3.
  const roundPrompts = isBo3
    ? prompts.filter((p) => (p.round_number ?? 1) === roundNumber)
    : prompts;
  const myPrompt = roundPrompts.find((p) => p.profile_id === user?.id);
  const opponentPrompt = roundPrompts.find((p) => p.profile_id !== user?.id);

  const myPromptLocked = myPrompt?.is_locked || false;
  const opponentPromptLocked = opponentPrompt?.is_locked || false;

  // Cleanup retry timer on unmount or battle change
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (resolveRetryTimerRef.current) {
        clearTimeout(resolveRetryTimerRef.current);
        resolveRetryTimerRef.current = null;
      }
    };
  }, [battleId]);

  useEffect(() => {
    hasRetriedResolutionRef.current = false;
  }, [battleId]);

  // Handle queued battle fallback retry
  useEffect(() => {
    if (!battle || !user) return;

    // Clear existing timer when battle changes
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    // Schedule retry for created battles where user is player_one
    if (
      battle.status === 'created' &&
      battle.player_one_id === user.id &&
      battle.player_one_character_id &&
      battle.mode
    ) {
      const createdAt = new Date(battle.created_at).getTime();
      const fallbackTime = createdAt + 60000; // 60 seconds after creation
      const now = Date.now();
      const battleAge = now - createdAt;
      const ageSeconds = battleAge / 1000;
      const delay =
        ageSeconds >= 60
          ? retryNonce === 0
            ? 0
            : 15000
          : Math.max(0, fallbackTime - now);

      retryTimerRef.current = setTimeout(async () => {
        try {
          setRetryMessage('Checking for opponent...');
          if (battleId) {
            const routedExisting = await routeMatchedBattle(battleId);
            if (routedExisting) return;
          }

          const result = await startMatchmaking(
            battle.player_one_character_id,
            battle.mode as BattleMode,
          );

          if (result.matched) {
            const routed = await routeMatchedBattle(result.battle_id);
            if (!routed) {
              if (result.battle_id !== battleId) {
                router.replace(
                  `/(battle)/waiting?battleId=${result.battle_id}`,
                );
              } else {
                setRetryNonce((n) => n + 1);
              }
            }
          } else {
            // Update message and keep waiting
            if (result.message) {
              setRetryMessage(result.message);
            }
            // If backend returned a different battle_id while unmatched, replace waiting screen
            if (result.battle_id !== battleId) {
              router.replace(`/(battle)/waiting?battleId=${result.battle_id}`);
            } else {
              setRetryNonce((n) => n + 1);
            }
          }
        } catch (err) {
          console.error('Matchmaking retry failed:', err);
          setRetryMessage('Retry failed, waiting for updates...');
          setRetryNonce((n) => n + 1);
        }
      }, delay);
    }
  }, [battle, user, battleId, router, retryNonce, routeMatchedBattle]);

  useEffect(() => {
    if (!battle) return;

    const opponentReady = hasOpponent(battle);

    // Bo3: route to round-result the moment THIS round flips to result_ready;
    // route to final result when the whole battle completes.
    if (isBo3) {
      if (
        (battle.status === 'matched' ||
          battle.status === 'waiting_for_prompts') &&
        !myPromptLocked
      ) {
        if (opponentReady) {
          router.replace(`/(battle)/face-off?battleId=${battleId}`);
        } else {
          setRetryMessage('Waiting for opponent details...');
        }
        return;
      }

      if (battle.status === 'completed') {
        router.replace(`/(battle)/result?battleId=${battleId}`);
        return;
      }
      const r = rounds.find((row) => row.round_number === roundNumber);
      if (r && r.status === 'result_ready') {
        router.replace(
          `/(battle)/round-result?battleId=${battleId}&round=${roundNumber}`,
        );
        return;
      }
      // If a new round has been opened and we haven't submitted yet, push
      // back to prompt-entry for that new round.
      const battleRound = battle.current_round ?? 1;
      if (battleRound !== roundNumber && !myPromptLocked) {
        router.replace(
          `/(battle)/prompt-entry?battleId=${battleId}&round=${battleRound}`,
        );
      }
      return;
    }

    // Single-format (legacy) behavior preserved.
    if (
      battle.status === 'result_ready' ||
      battle.status === 'completed' ||
      battle.status === 'generation_failed'
    ) {
      router.replace(`/(battle)/result?battleId=${battleId}`);
      return;
    }

    if (
      (battle.status === 'matched' ||
        battle.status === 'waiting_for_prompts') &&
      !myPromptLocked
    ) {
      if (opponentReady) {
        router.replace(`/(battle)/face-off?battleId=${battleId}`);
      } else {
        setRetryMessage('Waiting for opponent details...');
      }
    }
  }, [battle, myPromptLocked, battleId, router, isBo3, rounds, roundNumber]);

  useEffect(() => {
    if (!battleId || !battle || battle.status !== 'resolving') return;
    if (hasRetriedResolutionRef.current || resolveRetryTimerRef.current) return;

    resolveRetryTimerRef.current = setTimeout(async () => {
      hasRetriedResolutionRef.current = true;
      resolveRetryTimerRef.current = null;

      try {
        setRetryMessage('Still resolving. Asking the judge to retry...');
        const result = await retryBattleResolution(battleId);

        if (result.error) {
          console.error('Battle resolution retry failed:', result.error);
          setRetryMessage('Judge retry failed. Waiting for updates...');
          return;
        }

        setRetryMessage('Judge finished. Loading result...');
      } catch (err) {
        console.error('Battle resolution retry failed:', err);
        setRetryMessage('Judge retry failed. Waiting for updates...');
      }
    }, 5000);
  }, [battle, battleId]);

  const isResolving = battle?.status === 'resolving';
  const heroTitle = isResolving
    ? 'The Judge Deliberates'
    : 'Entering the Arena';
  const heroSubtitle = isResolving
    ? 'Weighing every word of both prompts…'
    : opponentPromptLocked
      ? 'Both fighters are locked in. Standby…'
      : 'Your challenger is choosing their move…';

  return (
    <ImageBackground
      source={UiArt.arenaBackdrop}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Scrim keeps overlay text AA on top of the arena illustration. */}
      <View style={styles.scrim} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {isBo3 ? (
          <View style={styles.seriesBlock}>
            <SeriesScoreIndicator
              score={series_score}
              currentRound={roundNumber}
              format={format}
              bestOf={battle?.best_of ?? 3}
            />
            <Text style={styles.seriesCaption}>
              Round {roundNumber} of {battle?.best_of ?? 3} — Locking in
            </Text>
          </View>
        ) : null}

        {/* Hero anticipation block — fixed light text sits on the scrim. */}
        <ActivityIndicator
          size="large"
          color="#FFFFFF"
          style={styles.spinner}
        />
        <Text style={styles.heroTitle}>{heroTitle}</Text>
        <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>

        {battle?.theme ? (
          <View
            style={[styles.card, { backgroundColor: colors.card }, Elevation.md]}
          >
            <Text style={[styles.themeLabel, { color: colors.textSecondary }]}>
              THEME
            </Text>
            <Text style={[styles.themeText, { color: colors.primary }]}>
              {battle.theme}
            </Text>
          </View>
        ) : null}

        {/* Status checklist on a solid surface (AA in both themes). */}
        <View
          style={[styles.card, { backgroundColor: colors.card }, Elevation.md]}
        >
          <View style={styles.statusRow}>
            <Ionicons
              name={myPromptLocked ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={myPromptLocked ? colors.success : colors.textSecondary}
              style={styles.statusIcon}
            />
            <Text style={[styles.statusText, { color: colors.text }]}>
              Your prompt submitted
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Ionicons
              name={
                opponentPromptLocked ? 'checkmark-circle' : 'ellipse-outline'
              }
              size={20}
              color={
                opponentPromptLocked ? colors.success : colors.textSecondary
              }
              style={styles.statusIcon}
            />
            <Text style={[styles.statusText, { color: colors.text }]}>
              Opponent's prompt submitted
            </Text>
          </View>

          {isResolving && (
            <View style={styles.statusRow}>
              <Ionicons
                name="flash"
                size={20}
                color={colors.warning}
                style={styles.statusIcon}
              />
              <Text style={[styles.statusText, { color: colors.text }]}>
                Judge is scoring…
              </Text>
            </View>
          )}
        </View>

        {!isSubscribed && (
          <Text style={styles.onScrimNote}>Realtime updates connecting…</Text>
        )}

        {retryMessage && (
          <Text style={[styles.onScrimNote, styles.retryMessage]}>
            {retryMessage}
          </Text>
        )}

        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.push('/(tabs)/home')}
          accessibilityLabel="Return to home"
          accessibilityRole="button"
        >
          <Text style={styles.homeButtonText}>Return to Home</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          You'll be notified when the result is ready
        </Text>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B0F',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 11, 15, 0.55)',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  seriesBlock: {
    width: '100%',
  },
  seriesCaption: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: Spacing.md,
  },
  spinner: {
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontSize: Typography.sizes.base,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  card: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  themeLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  themeText: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusIcon: {
    marginRight: Spacing.md,
    width: 32,
    textAlign: 'center',
  },
  statusText: {
    fontSize: Typography.sizes.base,
  },
  onScrimNote: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryMessage: {
    fontStyle: 'italic',
  },
  homeButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    marginBottom: Spacing.md,
  },
  homeButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    color: '#FFFFFF',
  },
  hint: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
  },
});
