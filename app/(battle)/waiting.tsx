import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BattleThemePlaque } from '@/components/game/battle/BattleThemePlaque';
import {
  GameText as Text,
  GameFooter,
  GameButton,
  GamePanel,
} from '@/components/game';
import BattleOpponentSafety from '@/components/BattleOpponentSafety';
import { requestFirstAsyncWaitNotifications } from '@/utils/asyncWaitNotifications';
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
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import { usePortraitViewer } from '@/hooks/usePortraitViewer';
import {
  Spacing,
  Typography,
  BorderRadius,
  Elevation,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import { presentationForTheme } from '@/constants/ThemeArt';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useLeaveBattle } from '@/hooks/useLeaveBattle';
import { useAuth } from '@/providers/AuthProvider';
import {
  retryBattleResolution,
  startMatchmaking,
  hasOpponent,
  BattleMode,
  canLeaveBattleStatus,
  leaveActionLabel,
} from '@/utils/battles';
import { supabase } from '@/utils/supabase';
import { hapticSuccess } from '@/utils/haptics';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import VersusStrip from '@/components/VersusStrip';
import PortraitViewer from '@/components/PortraitViewer';
import ArenaTips from '@/components/ArenaTips';
import { ARENA_TIPS } from '@/utils/arenaTips';
import {
  waitingHero,
  sanitizeServerMessage,
  opponentDeadlineLine,
  resolveRoundParam,
  STILL_SCORING,
  RECONNECTING,
  ARENA_PREPARING,
  NOTIFY_ON,
  NOTIFY_OFF,
  BOT_READY,
  type WaitingHeroCopy,
} from '@/utils/prebattleCopy';
import { generateIdempotencyKey } from '@/utils/characters';
import { useBattleAudio } from '@/providers/BattleAudioProvider';

export default function WaitingScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { battleId, round, requestId } = useLocalSearchParams<{
    battleId: string;
    round?: string;
    requestId?: string;
  }>();
  const matchmakingRequestId = useRef(
    requestId || generateIdempotencyKey(),
  ).current;

  const {
    battle,
    prompts,
    isSubscribed,
    format,
    current_round,
    series_score,
    rounds,
  } = useRealtimeBattle(battleId || null);
  const roundNumber = resolveRoundParam(round, current_round);
  const isBo3 = format === 'bo3';
  const isBot = Boolean(battle?.is_player_two_bot);
  useBattleAudio(battle?.theme);
  const arenaPresentation = presentationForTheme(battle?.theme);
  const isPlayerOne =
    Boolean(battle) && Boolean(user) && battle!.player_one_id === user!.id;

  // Both fighters use identity under RLS,
  // portraits from sign-battle-portraits, tap to enlarge. The room used to
  // show neither fighter, so a player could not tell whose lock they waited on.
  const {
    p1: p1Char,
    p2: p2Char,
    refreshPortraits,
  } = useBattleCharacters(battleId || null, battle);
  const portraitViewer = usePortraitViewer(refreshPortraits);
  const myChar = isPlayerOne ? p1Char : p2Char;
  const oppChar = isPlayerOne ? p2Char : p1Char;
  const reduceMotion = useReducedMotion();
  // One offset per visit so the tips do not always open on the same line.
  const tipSeed = useRef(Math.floor(Math.random() * ARENA_TIPS.length)).current;

  // Returning to Arena parks this live battle. Forfeit is a separate action.
  const leave = useLeaveBattle(battleId || null, {
    format,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot,
    prompts,
    myProfileId: user?.id,
    status: battle?.status,
    hasOpponent: Boolean(battle?.player_two_id || battle?.is_player_two_bot),
  });

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const hasRetriedResolutionRef = useRef(false);
  const handledTerminalRef = useRef(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [slowScoring, setSlowScoring] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  const routeMatchedBattle = useCallback(
    async (targetBattleId: string) => {
      const { data: battleRow, error } = await supabase
        .from('battles')
        .select(
          'format, player_two_id, player_two_character_id, is_player_two_bot, bot_persona_id',
        )
        .eq('id', targetBattleId)
        .single();

      if (error || !battleRow || !hasOpponent(battleRow)) {
        setQueueNote(ARENA_PREPARING);
        return false;
      }

      router.replace(`/(battle)/face-off?battleId=${targetBattleId}`);
      return true;
    },
    [router],
  );

  const roundData = useMemo(
    () =>
      isBo3
        ? (rounds.find((r) => r.round_number === roundNumber) ?? null)
        : null,
    [isBo3, rounds, roundNumber],
  );

  // Filter prompts to the current round when bo3.
  const roundPrompts = isBo3
    ? prompts.filter((p) => (p.round_number ?? 1) === roundNumber)
    : prompts;
  const myPrompt = roundPrompts.find((p) => p.profile_id === user?.id);
  const opponentPrompt = roundPrompts.find((p) => p.profile_id !== user?.id);

  // Lock state from the row stamps first, the prompt rows second. The
  // opponent's prompt row is not readable before reveal, so a screen keyed
  // only on prompts showed "Opponent's prompt submitted" unchecked until the
  // result arrived. Bots never insert a prompt row at all.
  const myLockedAt = isBo3
    ? isPlayerOne
      ? roundData?.player_one_locked_at
      : roundData?.player_two_locked_at
    : isPlayerOne
      ? battle?.player_one_locked_at
      : battle?.player_two_locked_at;
  const opponentLockedAt = isBo3
    ? isPlayerOne
      ? roundData?.player_two_locked_at
      : roundData?.player_one_locked_at
    : isPlayerOne
      ? battle?.player_two_locked_at
      : battle?.player_one_locked_at;

  const myPromptLocked = Boolean(myPrompt?.is_locked) || Boolean(myLockedAt);
  const opponentPromptLocked =
    isBot || Boolean(opponentPrompt?.is_locked) || Boolean(opponentLockedAt);

  const opponentReady = battle ? hasOpponent(battle) : false;
  useEffect(() => {
    if (
      user &&
      battle &&
      !isBot &&
      myPromptLocked &&
      !opponentPromptLocked &&
      battle.player_two_id
    ) {
      void requestFirstAsyncWaitNotifications(user.id);
    }
  }, [user, battle, isBot, myPromptLocked, opponentPromptLocked]);

  const isResolving =
    battle?.status === 'resolving' || roundData?.status === 'resolving';

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
    handledTerminalRef.current = false;
    setSlowScoring(false);
  }, [battleId]);

  // Only promise a notification when one can actually arrive.
  useEffect(() => {
    let cancelled = false;
    Notifications.getPermissionsAsync()
      .then((p) => {
        if (cancelled) return;
        setNotifGranted(Boolean(p.granted) || p.status === 'granted');
      })
      .catch(() => {
        if (!cancelled) setNotifGranted(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          if (battleId) {
            const routedExisting = await routeMatchedBattle(battleId);
            if (routedExisting) return;
          }

          const result = await startMatchmaking(
            battle.player_one_character_id,
            battle.mode as BattleMode,
            {
              requestId: matchmakingRequestId,
              resumeBattleId: battleId,
            },
          );

          if (result.matched) {
            const routed = await routeMatchedBattle(result.battle_id);
            if (!routed) {
              if (result.battle_id !== battleId) {
                router.replace(
                  `/(battle)/waiting?battleId=${result.battle_id}&requestId=${matchmakingRequestId}`,
                );
              } else {
                setRetryNonce((n) => n + 1);
              }
            }
          } else {
            setQueueNote(sanitizeServerMessage(result.message));
            // If backend returned a different battle_id while unmatched, replace waiting screen
            if (result.battle_id !== battleId) {
              router.replace(
                `/(battle)/waiting?battleId=${result.battle_id}&requestId=${matchmakingRequestId}`,
              );
            } else {
              setRetryNonce((n) => n + 1);
            }
          }
        } catch (err) {
          // Logged, not narrated: the hero already says we are still looking,
          // and "retry failed" is a sentence for a developer.
          console.error('Matchmaking retry failed:', err);
          setRetryNonce((n) => n + 1);
        }
      }, delay);
    }
  }, [
    battle,
    user,
    battleId,
    router,
    retryNonce,
    routeMatchedBattle,
    matchmakingRequestId,
  ]);

  // Terminal without a result, in either format. The Bo3 branch below had no
  // handler at all, so a canceled series left the player on a spinner.
  useEffect(() => {
    if (!battle || handledTerminalRef.current) return;
    if (battle.status === 'canceled' || battle.status === 'expired') {
      handledTerminalRef.current = true;
      Alert.alert('Battle ended', 'This battle is no longer available.', [
        { text: 'OK', onPress: () => router.dismissTo('/(tabs)/home') },
      ]);
    }
  }, [battle, router]);

  useEffect(() => {
    if (!battle) return;
    if (battle.status === 'canceled' || battle.status === 'expired') return;

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
          setQueueNote(null);
        }
        return;
      }

      if (battle.status === 'completed') {
        hapticSuccess();
        router.replace(`/(battle)/result?battleId=${battleId}`);
        return;
      }
      const r = rounds.find((row) => row.round_number === roundNumber);
      if (r && r.status === 'result_ready') {
        hapticSuccess();
        router.replace(
          `/(battle)/round-result?battleId=${battleId}&round=${roundNumber}`,
        );
        return;
      }
      // Resume the writing workspace with a fresh move for the new round.
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
      hapticSuccess();
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
        setQueueNote(null);
      }
    }
  }, [
    battle,
    myPromptLocked,
    opponentReady,
    battleId,
    router,
    isBo3,
    rounds,
    roundNumber,
  ]);

  // One server-side nudge after 5 s of resolving. The screen no longer
  // narrates the attempt; it shows a single calm line once scoring is slow.
  useEffect(() => {
    if (!battleId || !battle || battle.status !== 'resolving') {
      setSlowScoring(false);
      return;
    }
    if (hasRetriedResolutionRef.current || resolveRetryTimerRef.current) return;

    resolveRetryTimerRef.current = setTimeout(async () => {
      hasRetriedResolutionRef.current = true;
      resolveRetryTimerRef.current = null;
      setSlowScoring(true);

      try {
        const result = await retryBattleResolution(battleId);
        if (result.error) {
          console.error('Battle resolution retry failed:', result.error);
        }
      } catch (err) {
        console.error('Battle resolution retry failed:', err);
      }
    }, 5000);
  }, [battle, battleId]);

  // Lock-in clock for the other side. Ticks only while there is something to
  // count down to, and the deadline is the opponent's, not ours.
  const opponentDeadline = isBo3
    ? (roundData?.lock_in_deadline ?? null)
    : isPlayerOne
      ? (battle?.player_two_prompt_deadline ?? null)
      : (battle?.player_one_prompt_deadline ?? null);
  const deadlineMs = opponentDeadline ? Date.parse(opponentDeadline) : NaN;
  const showCountdown =
    Number.isFinite(deadlineMs) &&
    opponentReady &&
    myPromptLocked &&
    !opponentPromptLocked &&
    !isResolving;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!showCountdown) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showCountdown]);

  // The same branch waitingHero() takes for "The judge deliberates": both
  // locked, or the server already resolving. Tips fill that wait and no other;
  // while the opponent still writes, the deadline line is the thing to read.
  const isJudging =
    Boolean(battle) &&
    opponentReady &&
    (Boolean(isResolving) || (myPromptLocked && opponentPromptLocked));

  const hero: WaitingHeroCopy = battle
    ? waitingHero({
        hasOpponent: opponentReady,
        myLocked: myPromptLocked,
        opponentLocked: opponentPromptLocked,
        isResolving: Boolean(isResolving),
      })
    : { title: 'Entering the arena', subtitle: 'Connecting…' };

  // Say the wait changed; a sighted player sees the title swap, a screen
  // reader user hears nothing otherwise.
  const lastAnnouncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!battle) return;
    if (lastAnnouncedRef.current === hero.title) return;
    lastAnnouncedRef.current = hero.title;
    AccessibilityInfo.announceForAccessibility(
      `${hero.title}. ${hero.subtitle}`,
    );
  }, [battle, hero.title, hero.subtitle]);

  const opponentRowLabel = isBot ? BOT_READY : "Opponent's prompt submitted";
  const canLeave = canLeaveBattleStatus(battle?.status);
  const leaveLabel = leaveActionLabel({
    status: battle?.status,
    mode: (battle?.mode ?? 'ranked') as BattleMode,
    isBot,
    hasOpponent: opponentReady,
  });
  const isFinishing =
    battle?.status === 'resolving' ||
    battle?.status === 'result_ready' ||
    battle?.status === 'generating_video';

  return (
    <ImageBackground
      source={arenaPresentation.backdrop}
      style={styles.container}
      resizeMode="cover"
    >
      {/* Scrim keeps overlay text AA on top of the arena illustration. */}
      <View style={styles.scrim} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {isBo3 ? (
            <View style={styles.seriesBlock}>
              <SeriesScoreIndicator
                score={series_score}
                currentRound={roundNumber}
                format={format}
                bestOf={battle?.best_of ?? 3}
                viewer={isPlayerOne ? 'p1' : 'p2'}
              />
              <Text style={styles.seriesCaption}>
                Round {roundNumber} of {battle?.best_of ?? 3} — Locking in
              </Text>
            </View>
          ) : null}

          <View style={styles.versus}>
            <VersusStrip
              left={{
                name: myChar?.name ?? 'You',
                archetype: myChar?.archetype ?? '',
                signatureColor: myChar?.signatureColor ?? colors.primary,
                portraitUrl: myChar?.portraitUrl,
                cosmetics: myChar?.cosmetics,
                label: 'YOU',
                onAvatarPress: portraitViewer.canOpen(myChar)
                  ? (opener) => portraitViewer.open(myChar, opener)
                  : undefined,
              }}
              right={{
                name: oppChar?.name ?? 'Opponent',
                archetype: oppChar?.archetype ?? '',
                signatureColor: oppChar?.signatureColor ?? colors.textSecondary,
                portraitUrl: oppChar?.portraitUrl,
                cosmetics: oppChar?.cosmetics,
                label: battle?.is_player_two_bot
                  ? 'AI OPPONENT · PRACTICE'
                  : 'OPPONENT',
                onAvatarPress: portraitViewer.canOpen(oppChar)
                  ? (opener) => portraitViewer.open(oppChar, opener)
                  : undefined,
              }}
              subtitle={isBo3 ? `Round ${roundNumber}` : null}
            />
          </View>

          {/* Hero anticipation block — fixed light text sits on the scrim. */}
          <ActivityIndicator
            size="large"
            color="#FFFFFF"
            style={styles.spinner}
            accessibilityLabel={hero.title}
          />
          <GameDisplayTitle style={styles.heroTitle} accessibilityRole="header">
            {hero.title}
          </GameDisplayTitle>
          <Text style={styles.heroSubtitle}>{hero.subtitle}</Text>

          {showCountdown ? (
            <Text
              style={[styles.countdown, NumericFontVariant]}
              accessibilityLiveRegion="polite"
            >
              {opponentDeadlineLine(deadlineMs - now)}
              {'\n'}
              {exactBattleDeadline(opponentDeadline)}
            </Text>
          ) : null}

          {battle?.theme ? (
            <View style={{ width: '100%', marginBottom: 16 }}>
              <BattleThemePlaque theme={battle.theme} />
            </View>
          ) : null}

          {/* Status checklist on a solid surface (AA in both themes). */}
          <GamePanel
            tone="ornate"
            style={[
              styles.card,
              { backgroundColor: colors.card },
              Elevation.md,
            ]}
          >
            <View
              style={styles.statusRow}
              accessible
              accessibilityRole="checkbox"
              accessibilityState={{ checked: myPromptLocked }}
              accessibilityLabel="Your prompt submitted"
            >
              <GameSymbol
                name={myPromptLocked ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={myPromptLocked ? colors.success : colors.textSecondary}
                style={styles.statusIcon}
              />
              <Text style={[styles.statusText, { color: colors.text }]}>
                Your prompt submitted
              </Text>
            </View>

            <View
              style={styles.statusRow}
              accessible
              accessibilityRole="checkbox"
              accessibilityState={{ checked: opponentPromptLocked }}
              accessibilityLabel={opponentRowLabel}
            >
              <GameSymbol
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
                {opponentRowLabel}
              </Text>
            </View>

            {isResolving && (
              <View
                style={styles.statusRow}
                accessible
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel="Judge is scoring"
              >
                <GameSymbol
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
          </GamePanel>

          {isJudging ? (
            <View style={styles.tips}>
              <ArenaTips seed={tipSeed} reduceMotion={reduceMotion} />
            </View>
          ) : null}

          {!isSubscribed && (
            <Text style={styles.onScrimNote}>{RECONNECTING}</Text>
          )}

          {isResolving && slowScoring ? (
            <Text style={styles.onScrimNote}>{STILL_SCORING}</Text>
          ) : null}

          {!opponentReady && queueNote ? (
            <Text style={[styles.onScrimNote, styles.queueNote]}>
              {queueNote}
            </Text>
          ) : null}

          {notifGranted === null ? null : (
            <Text style={styles.hint}>
              {notifGranted ? NOTIFY_ON : NOTIFY_OFF}
            </Text>
          )}

          {canLeave ? (
            <TouchableOpacity
              style={styles.leaveLink}
              onPress={() => leave.confirmLeave()}
              disabled={leave.isLeaving || !leave.canForfeit}
              accessibilityLabel={leaveLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: leave.isLeaving }}
            >
              <Text style={styles.leaveLinkText}>
                {leave.isLeaving ? 'Leaving…' : leaveLabel}
              </Text>
            </TouchableOpacity>
          ) : isFinishing ? (
            <Text style={styles.hint}>
              This battle is finishing now, so it can no longer be left.
            </Text>
          ) : null}
          <BattleOpponentSafety
            battle={battle}
            myId={user?.id}
            name={oppChar?.name}
          />
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView
        edges={['bottom']}
        style={{ backgroundColor: colors.background }}
      >
        <GameFooter>
          <GameButton
            label="Return to Arena"
            tone="secondary"
            icon="chevron-back"
            onPress={() => router.dismissTo('/(tabs)/home')}
          />
        </GameFooter>
      </SafeAreaView>
      <PortraitViewer
        returnFocusRef={portraitViewer.returnFocusRef}
        visible={portraitViewer.visible}
        uri={portraitViewer.viewer?.uri ?? null}
        caption={portraitViewer.viewer?.caption}
        aspect={portraitViewer.viewer?.aspect}
        onImageError={portraitViewer.handleError}
        onClose={portraitViewer.close}
      />
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
    paddingTop: Spacing.lg + 44,
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
  versus: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  tips: {
    width: '100%',
    marginBottom: Spacing.lg,
  },
  spinner: {
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: Typography.sizes.xxxl,
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
  countdown: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: -Spacing.md,
    marginBottom: Spacing.lg,
  },
  card: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: 0,
    marginBottom: Spacing.lg,
  },
  themeLabel: {
    fontSize: 14,
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
    flex: 1,
    fontSize: Typography.sizes.base,
  },
  onScrimNote: {
    fontSize: Typography.sizes.sm,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  queueNote: {
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
  // Forfeit stays separate from parking, with its own accessible target.
  leaveLink: {
    marginTop: Spacing.lg,
    alignSelf: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  leaveLinkText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    color: 'rgba(255,255,255,0.85)',
    textDecorationLine: 'underline',
  },
  hint: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
  },
});
