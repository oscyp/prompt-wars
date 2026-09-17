import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { useSheetReturnFocus } from '@/hooks/useSheetReturnFocus';
import HPBar from '@/components/HPBar';
import {
  GameText as Text,
  GameFooter,
  GameButton,
  GamePanel,
  GameBevel,
} from '@/components/game';
import { humanOpponentId } from '@/components/BattleOpponentSafety';
import {
  seriesDecisionExplanation,
  isUnratedExhibition,
  EXHIBITION_EXPLANATION,
} from '@/utils/battleExplanation';
import { markBattleResultRead } from '@/utils/battleAttention';
import { useMediaRecovery } from '@/hooks/useMediaRecovery';
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
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useCredits } from '@/hooks/useCredits';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import {
  Spacing,
  Typography,
  NumericFontVariant,
  Motion,
  BorderRadius,
} from '@/constants/DesignTokens';
import { inkFor } from '@/utils/contrast';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useBattleAppeal } from '@/hooks/useBattleAppeal';
import { BattleAppealPanel } from '@/components/BattleAppealPanel';
import { reviewedRounds } from '@/utils/appeals';
import TutorialCoach from '@/components/TutorialCoach';
import { recordFunnelEvent } from '@/utils/tutorial';
import {
  requestVideoUpgrade,
  type EntitlementCheck,
} from '@/utils/monetization';
import { ReportBlockSheet } from '@/components';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';
import ResultShareCard from '@/components/ResultShareCard';
import { RevealSequence } from '@/components/reveal';
import { orientSeriesScore } from '@/components/SeriesScoreIndicator';
import { shareResultCard, shareBattleVideo } from '@/utils/share';
import { invokeAuthenticatedFunction, supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useBattleAudio } from '@/providers/BattleAudioProvider';
import { BattleRound, RewardSummary } from '@/types/battle';
import {
  revealModelFrom,
  payoffRows,
  payoffFallbackLine,
} from '@/utils/revealBeats';
import { revealSeenKey, summaryJudgeLine } from '@/utils/revealLayout';
import {
  RESULT_LOAD_TIMEOUT_MS,
  battleOutcomeFor,
  canOfferVideoUpgrade,
  outcomeAnnouncement,
  outcomeHeadline,
  ratingSummary,
  roundMiniView,
  singleMatchupNote,
  upgradeBlockedCopy,
  upgradeSheetCopy,
  videoStatusCopy,
} from '@/utils/resultView';

type CaptionLine = { start_ms: number; end_ms: number; text: string };

type ScorePayload = {
  explanation?: string;
  move_type_matchup?: { player_one?: string; player_two?: string };
  rating_gated?: string;
} | null;

type RatingDeltaPayload = Record<string, { delta?: unknown }> | null;

/** Header offset shared with the writing workspace under the transparent header. */
const HEADER_OFFSET = 44;

/** Statuses that carry a result the reveal can play. */
const RESOLVED_STATUSES = new Set([
  'result_ready',
  'generating_video',
  'completed',
]);

/** Result is reached by replace; "Back to Arena" is the way out. */
const HEADER_OPTIONS = { headerLeft: () => null };

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function ResultScreen() {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { stopMusic } = useBattleAudio();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  useEffect(() => stopMusic(), [stopMusic]);

  const {
    battle,
    videoJob,
    refetch,
    format,
    series_score,
    rounds: originalRounds,
  } = useRealtimeBattle(battleId || null);
  const { p1, p2 } = useBattleCharacters(battleId || null, battle);
  const { credits, loading: creditsLoading } = useCredits();
  const appeal = useBattleAppeal(battleId || null, user?.id || null, refetch);
  const rounds = reviewedRounds(
    originalRounds,
    battle?.resolution_metadata,
    battle?.player_one_id || '',
    battle?.player_two_id || null,
  );
  const revised = (battle?.adjudication_revision ?? 0) > 0;
  const noContest =
    (battle?.resolution_metadata as { status?: string } | null)?.status ===
    'no_contest';
  const [isCheckingUpgrade, setIsCheckingUpgrade] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  /** Non-null while the cost sheet is open. */
  const upgradeFocusRef = useRef<View>(null);
  const battleAgainFocusRef = useRef<View>(null);
  const {
    remember: rememberUpgradeOpener,
    returnFocusRef: upgradeReturnFocusRef,
  } = useSheetReturnFocus(battleAgainFocusRef);
  const [upgradePreview, setUpgradePreview] = useState<EntitlementCheck | null>(
    null,
  );
  const [isSharing, setIsSharing] = useState(false);

  const cardRef = useRef<View>(null);
  const isBo3 = format === 'bo3';

  const [showReportSheet, setShowReportSheet] = useState(false);
  const finalRound = [...rounds]
    .filter((round) => round.status === 'result_ready')
    .sort((a, b) => b.round_number - a.round_number)[0];
  const media = useMediaRecovery<CaptionLine[]>({
    assetKey:
      user?.id && videoJob?.id ? `${user.id}:${battleId}:${videoJob.id}` : null,
    enabled: videoJob?.status === 'succeeded',
    resolveVideoUrl: async () => {
      const signed = await invokeAuthenticatedFunction<{ signed_url: string }>(
        'sign-battle-video',
        { video_job_id: videoJob?.id },
      );
      return signed.signed_url;
    },
    resolveCaptions: async () => {
      const { data: videoRow, error: videoError } = await supabase
        .from('videos')
        .select('id')
        .eq('battle_id', battleId)
        .eq('video_job_id', videoJob?.id)
        .limit(1)
        .maybeSingle();
      if (videoError) throw videoError;
      if (!videoRow) return [];
      const { data: captions, error } = await supabase
        .from('video_captions')
        .select('json_payload')
        .eq('video_id', videoRow.id)
        .eq('locale', 'en-US')
        .maybeSingle();
      if (error) throw error;
      return (
        (captions?.json_payload as { lines?: CaptionLine[] } | null)?.lines ??
        []
      );
    },
  });
  const { reportPlaybackError } = media;
  const videoUrl = videoJob?.status === 'succeeded' ? media.videoUrl : null;
  const captionLines = media.captions ?? [];
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    const subscription = player.addListener('statusChange', (event) => {
      if (event.status === 'error') reportPlaybackError(event.error);
    });
    return () => subscription.remove();
  }, [player, reportPlaybackError]);

  // The hook fetches on mount and on (re)subscribe, but applies results only
  // `if (res.data)`, so a failed fetch leaves `battle` null with no error to
  // show. After a while, stop spinning and offer a way out.
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    if (battle) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(
      () => setLoadTimedOut(true),
      RESULT_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [battle, retryKey]);

  const handleRetry = useCallback(() => {
    setLoadTimedOut(false);
    setRetryKey((k) => k + 1);
    refetch();
  }, [refetch]);

  // --- Reveal vs summary ------------------------------------------------------
  // `null` until AsyncStorage has said whether this battle's reveal was seen;
  // false plays the reveal; true shows the summary. Persisted per battle so
  // reopening the result from the Battles tab goes straight to the summary.
  const [revealDone, setRevealDone] = useState<boolean | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const seenBeforeRef = useRef(false);
  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;
    AsyncStorage.getItem(revealSeenKey(battleId))
      .then((value) => {
        if (cancelled) return;
        seenBeforeRef.current = value === '1';
        setRevealDone(value === '1');
      })
      .catch(() => {
        if (!cancelled) setRevealDone(false);
      });
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  const handleRevealDone = useCallback(() => {
    setRevealDone(true);
    if (battleId) {
      AsyncStorage.setItem(revealSeenKey(battleId), '1').catch(() => {});
    }
  }, [battleId]);

  const handleReplay = useCallback(() => {
    seenBeforeRef.current = false;
    setReplayKey((k) => k + 1);
    setRevealDone(false);
  }, []);

  useEffect(() => {
    if (user?.id && battleId && battle && revealDone === true) {
      void markBattleResultRead(
        user.id,
        battleId,
        battle.adjudication_revision ?? 0,
      ).catch(() => {});
    }
  }, [user?.id, battleId, battle?.adjudication_revision, revealDone, battle]);

  // --- Everything below is from the viewer's side ---------------------------
  const myId = user?.id ?? null;
  const isPlayerOne = Boolean(battle) && battle?.player_one_id === myId;
  const isBot = Boolean(battle?.is_player_two_bot);
  const outcome = battle
    ? battleOutcomeFor({
        winnerId: battle.winner_id,
        isDraw: battle.is_draw,
        myProfileId: myId,
      })
    : null;
  const isWinner = outcome === 'won';
  const isDraw = outcome === 'draw';
  const { mine, theirs } = orientSeriesScore(
    series_score,
    isPlayerOne ? 'p1' : 'p2',
  );
  const headline = noContest
    ? 'No contest'
    : outcome
      ? outcomeHeadline({ format, outcome, mine, theirs })
      : '';
  const exhibition =
    isUnratedExhibition(battle?.mode, battle?.score_payload) ||
    (battle?.mode === 'ranked' &&
      rounds.some((round) => round.judge_payload?.mock_assisted));
  const decisionExplanation = seriesDecisionExplanation(
    battle?.resolution_metadata,
    isPlayerOne,
  );
  const scores = (battle?.score_payload as ScorePayload) ?? null;
  const rating = ratingSummary({
    ratingDeltaPayload: (battle?.rating_delta_payload ??
      null) as RatingDeltaPayload,
    scorePayload: scores,
    myProfileId: myId,
  });
  const canAppeal =
    Boolean(battle) && outcome === 'lost' && battle?.mode === 'ranked';

  const tier0Payload = battle?.tier0_reveal_payload ?? null;
  const model = useMemo(
    () =>
      revealModelFrom(tier0Payload, { myProfileId: myId, isPlayerOne, isBot }),
    [tier0Payload, myId, isPlayerOne, isBot],
  );
  const me = isPlayerOne ? p1 : p2;
  const them = isPlayerOne ? p2 : p1;
  const reward: RewardSummary | null =
    (myId ? battle?.reward_payload?.[myId] : null) ?? null;

  const resolved = Boolean(battle) && RESOLVED_STATUSES.has(battle!.status);
  const showReveal =
    resolved && revealDone === false && (!revised || replayKey > 0);
  const waitingOnSeen = resolved && revealDone === null;

  // The reveal's verdict beat carries the outcome haptic and announcement.
  // The summary announces only when it opened directly because the reveal
  // had already been seen, so a screen reader still hears the result once.
  const summaryAnnounced = useRef(false);
  useEffect(() => {
    if (summaryAnnounced.current || !battle || !outcome) return;
    if (!resolved || revealDone !== true || !seenBeforeRef.current) return;
    summaryAnnounced.current = true;
    AccessibilityInfo.announceForAccessibility(
      outcomeAnnouncement({ headline, ratingLine: rating.line }),
    );
  }, [battle, outcome, resolved, revealDone, headline, rating.line]);

  /**
   * Step 1 of the paid path: ask the server what the video would cost, then
   * show it. Nothing is spent until the sheet's confirm.
   */
  const handleUpgradePreview = async () => {
    rememberUpgradeOpener(upgradeFocusRef);
    if (!battleId) return;

    setIsCheckingUpgrade(true);
    try {
      const preview = await requestVideoUpgrade(
        battleId as string,
        false,
        finalRound?.id,
      );

      if (preview.can_upgrade) {
        setUpgradePreview(
          preview.entitlement_check ?? { can_upgrade: true, method: 'credits' },
        );
      } else if (preview.already_requested) {
        // A job exists that we have not seen yet; the status card will show it.
        refetch();
      } else if (preview.can_upgrade === false) {
        const blocked = upgradeBlockedCopy(
          preview.entitlement_check,
          creditsLoading ? null : credits,
        );
        Alert.alert(blocked.title, blocked.message, [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Top up',
            onPress: () => router.push('/(profile)/wallet'),
          },
        ]);
      } else {
        Alert.alert(
          'Couldn’t start the video',
          preview.error || 'Please try again.',
        );
      }
    } catch (err) {
      Alert.alert(
        'Couldn’t start the video',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setIsCheckingUpgrade(false);
    }
  };

  /** Step 2: the player has seen the price and tapped confirm. */
  const handleUpgradeConfirm = async () => {
    if (!battleId) return;

    setIsUpgrading(true);
    try {
      const result = await requestVideoUpgrade(
        battleId as string,
        true,
        finalRound?.id,
      );
      if (result.success || result.already_requested) {
        setUpgradePreview(null);
        AccessibilityInfo.announceForAccessibility(
          'Video requested. Generating your cinematic.',
        );
        refetch();
      } else {
        Alert.alert(
          'Couldn’t start the video',
          result.error || 'Please try again.',
        );
      }
    } catch (err) {
      Alert.alert(
        'Couldn’t start the video',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setIsUpgrading(false);
    }
  };

  // Opens the report sheet, which carries the reason picker and the
  // "also block" option (App Store 1.2 requires both report and block).
  const handleReport = () => {
    if (!battleId) return;
    setShowReportSheet(true);
  };

  const handleShareCard = async () => {
    if (noContest) return;
    setIsSharing(true);
    try {
      const shared = await shareResultCard(cardRef);
      if (!shared) {
        Alert.alert(
          'Sharing unavailable',
          'Sharing is not available on this device.',
        );
      }
    } catch {
      Alert.alert('Couldn’t share', 'The result card could not be shared.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareVideo = async () => {
    if (revised) return;
    if (!videoUrl) return;
    setIsSharing(true);
    try {
      const shared = await shareBattleVideo(videoUrl);
      if (!shared) {
        Alert.alert(
          'Sharing unavailable',
          'Sharing is not available on this device.',
        );
      }
    } catch {
      Alert.alert('Couldn’t share', 'The video could not be shared.');
    } finally {
      setIsSharing(false);
    }
  };

  const goHome = () => router.dismissTo('/(tabs)/home');

  if (!battle || !outcome || waitingOnSeen) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + HEADER_OFFSET,
          },
        ]}
      >
        <Stack.Screen options={HEADER_OPTIONS} />
        {loadTimedOut && !battle ? (
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
              Couldn’t load your result
            </GameDisplayTitle>
            <Text style={[styles.errorBody, { color: colors.textSecondary }]}>
              Check your connection and try again.
            </Text>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.actionButtonTextWhite}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: colors.backgroundTertiary },
              ]}
              onPress={goHome}
              accessibilityRole="button"
              accessibilityLabel="Back to Arena"
            >
              <Text style={[styles.actionButtonText, { color: colors.text }]}>
                Back to Arena
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loading, { color: colors.textSecondary }]}>
              Loading your result…
            </Text>
          </>
        )}
      </View>
    );
  }

  // --- The reveal -------------------------------------------------------------
  // Replaces the whole screen; the summary below is what it hands over to.
  // Never waits on the video job: Tier 0 data is all it needs.
  if (showReveal) {
    return (
      <>
        <Stack.Screen options={HEADER_OPTIONS} />
        {revised ? (
          <Text
            style={{
              color: colors.warning,
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingHorizontal: 16,
            }}
          >
            Original cinematic — this predates independent review.
          </Text>
        ) : null}
        <RevealSequence
          key={replayKey}
          model={model}
          format={format}
          outcome={
            revised
              ? battleOutcomeFor({
                  winnerId: model.winnerProfileId,
                  isDraw: model.isDraw,
                  myProfileId: myId,
                })
              : outcome
          }
          mine={mine}
          theirs={theirs}
          isBot={isBot}
          mode={battle.mode}
          myProfileId={myId}
          portraits={{
            meCosmetics: me?.cosmetics,
            themCosmetics: them?.cosmetics,
            meFighterUrl: me?.fighterUrl ?? null,
            meAvatarUrl: me?.portraitUrl ?? null,
            themFighterUrl: them?.fighterUrl ?? null,
            themAvatarUrl: them?.portraitUrl ?? null,
          }}
          rating={rating}
          reward={reward}
          battleCompleted={battle.status === 'completed'}
          onDone={handleRevealDone}
        />
      </>
    );
  }

  // --- The summary ------------------------------------------------------------
  // Pass a human opponent so the safety sheet can offer an independent block; report-intake only
  // derives the target itself for reported_type 'profile'.
  const opponentProfileId = humanOpponentId(battle, myId);
  const matchup = scores?.move_type_matchup ?? null;
  const myMove = matchup
    ? isPlayerOne
      ? matchup.player_one
      : matchup.player_two
    : null;
  const oppMove = matchup
    ? isPlayerOne
      ? matchup.player_two
      : matchup.player_one
    : null;
  const matchupNote = isBo3 ? null : singleMatchupNote(myMove, oppMove);

  // The judge's line lives in the reveal; the summary repeats it only when
  // the battle-level explanation says something the last round's did not.
  const judgeLine = summaryJudgeLine({
    battleExplanation: scores?.explanation,
    lastRoundExplanation: rounds[rounds.length - 1]?.judge_payload?.explanation,
  });

  // A failed job is treated as no job: the server refunds and accepts a
  // retry, so the CTA comes back under the failure card.
  const offerUpgrade = canOfferVideoUpgrade({
    job: videoJob,
    battleStatus: battle.status,
    mode: battle.mode,
  });
  // Only reached without a playable url; once one is signed the player card
  // takes over and this card goes away.
  const statusCopy =
    videoJob && !videoUrl && !media.playbackError
      ? videoStatusCopy({ status: videoJob.status, hasUrl: false })
      : null;
  const sheet = upgradePreview
    ? upgradeSheetCopy(upgradePreview, creditsLoading ? null : credits)
    : null;

  const winnerSide: 'me' | 'them' | null =
    isDraw || noContest ? null : isWinner ? 'me' : 'them';
  const accentColor =
    (revised ? null : model.winnerColor) ??
    (winnerSide === 'me'
      ? (me?.signatureColor ?? model.me.signatureColor)
      : winnerSide === 'them'
        ? (them?.signatureColor ?? model.them.signatureColor)
        : null);

  return (
    <>
      <Stack.Screen options={HEADER_OPTIONS} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + HEADER_OFFSET,
            paddingBottom: Spacing.xl,
          },
        ]}
      >
        {revised ? (
          <Text style={{ color: colors.warning, paddingVertical: 12 }}>
            The cinematic shows the original verdict before independent review.
            The current result is shown below.
          </Text>
        ) : null}
        <View style={styles.replayRow}>
          <TouchableOpacity
            style={styles.replayButton}
            onPress={handleReplay}
            accessibilityRole="button"
            accessibilityLabel="Replay reveal"
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
          >
            <GameSymbol
              name="play-outline"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={[styles.replayText, { color: colors.textSecondary }]}>
              Replay reveal
            </Text>
          </TouchableOpacity>
        </View>

        {exhibition ? (
          <Text
            accessibilityRole="text"
            style={{ color: colors.warning, paddingVertical: 12 }}
          >
            {EXHIBITION_EXPLANATION}
          </Text>
        ) : null}
        {/* Shareable scorecard region (captured by react-native-view-shot) */}
        <View
          ref={cardRef}
          collapsable={false}
          style={[styles.shareCapture, { backgroundColor: colors.background }]}
        >
          <Animated.View
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.slow)
            }
          >
            <ResultShareCard
              adjudicationRevision={battle.adjudication_revision ?? 0}
              headline={headline}
              outcome={noContest ? 'draw' : outcome}
              isKo={
                noContest
                  ? false
                  : revised
                    ? rounds.some((r) => r.is_ko)
                    : model.isKo
              }
              scoreLine={isBo3 ? `${mine}–${theirs}` : null}
              me={{
                name: model.me.name,
                archetype: me?.archetype ?? model.me.archetype,
                avatarUrl: me?.portraitUrl ?? model.me.portraitUrl,
              }}
              them={{
                name: model.them.name,
                archetype: them?.archetype ?? model.them.archetype,
                avatarUrl: them?.portraitUrl ?? model.them.portraitUrl,
              }}
              winnerSide={winnerSide}
              theme={battle.theme}
              ratingLine={
                noContest ||
                (battle.resolution_metadata as { status?: string } | null)
                  ?.status === 'overturned'
                  ? 'Original rating points reversed. No replacement rating.'
                  : rating.line
              }
              accentColor={accentColor}
            />
          </Animated.View>
        </View>
        {/* End shareable scorecard region */}
        {isBo3 &&
        !noContest &&
        finalRound?.player_one_hp_after != null &&
        finalRound.player_two_hp_after != null ? (
          <GamePanel
            tone="ornate"
            style={{ marginBottom: Spacing.md, gap: 12 }}
          >
            <Text variant="title" accessibilityRole="header">
              Final HP
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
              <View style={{ flex: 1, minWidth: 120 }}>
                <HPBar
                  current={
                    isPlayerOne
                      ? finalRound.player_one_hp_after
                      : finalRound.player_two_hp_after
                  }
                  max={
                    (isPlayerOne
                      ? battle.player_one_hp_max
                      : battle.player_two_hp_max) ?? 100
                  }
                  side="left"
                  playerName={model.me.name}
                />
              </View>
              <View style={{ flex: 1, minWidth: 120 }}>
                <HPBar
                  current={
                    isPlayerOne
                      ? finalRound.player_two_hp_after
                      : finalRound.player_one_hp_after
                  }
                  max={
                    (isPlayerOne
                      ? battle.player_two_hp_max
                      : battle.player_one_hp_max) ?? 100
                  }
                  side="right"
                  playerName={model.them.name}
                />
              </View>
            </View>
          </GamePanel>
        ) : null}

        {decisionExplanation ? (
          <Text style={{ color: colors.textSecondary, paddingVertical: 12 }}>
            {decisionExplanation}
          </Text>
        ) : null}

        {isBo3 ? (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.base).delay(120)
            }
          >
            <GameBevel color={colors.ornamentMuted} />
            <Text
              variant="title"
              style={[styles.cardTitle, { color: colors.text }]}
              accessibilityRole="header"
            >
              Round by round
            </Text>
            {rounds.length === 0 ? (
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                No round data yet.
              </Text>
            ) : (
              rounds.map((r) => (
                <RoundMiniCard
                  key={r.id}
                  round={r}
                  myProfileId={myId}
                  playerOneId={battle.player_one_id}
                />
              ))
            )}
          </Animated.View>
        ) : null}

        {/* Rewards, at rest: the payoff beat counts these up; a player who
            opens the result later from the Battles tab still needs to see
            what the battle was worth without replaying the reveal. */}
        {(() => {
          const rows = payoffRows({
            outcome,
            isBot: Boolean(battle.is_player_two_bot),
            mode: battle.mode,
            rating,
            reward,
            battleCompleted: battle.status === 'completed',
          });
          const fallback = payoffFallbackLine({
            reward,
            battleCompleted: battle.status === 'completed',
          });
          if (rows.length === 0 && !fallback) return null;
          return (
            <Animated.View
              style={[styles.card, { backgroundColor: colors.card }]}
              entering={
                reduceMotion
                  ? undefined
                  : FadeInDown.duration(Motion.durations.base).delay(150)
              }
              accessible
              accessibilityLabel={`Rewards. ${
                rows.length > 0
                  ? rows
                      .map((r) =>
                        r.detail
                          ? `${r.label}: ${r.value}, ${r.detail}`
                          : `${r.label}: ${r.value}`,
                      )
                      .join('. ')
                  : fallback
              }`}
            >
              <Text
                variant="title"
                style={[styles.cardTitle, { color: colors.text }]}
                accessibilityRole="header"
              >
                Rewards
              </Text>
              {rows.length === 0 ? (
                <Text
                  style={[styles.cardText, { color: colors.textSecondary }]}
                >
                  {fallback}
                </Text>
              ) : (
                rows.map((row) => (
                  <View key={row.key} style={styles.rewardRow}>
                    <View style={styles.rewardText}>
                      <Text
                        style={[
                          styles.rewardLabel,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {row.label}
                      </Text>
                      {row.detail ? (
                        <Text
                          style={[
                            styles.rewardDetail,
                            { color: colors.textTertiary },
                          ]}
                        >
                          {row.detail}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.rewardValue,
                        NumericFontVariant,
                        {
                          color:
                            row.tone === 'up'
                              ? colors.success
                              : row.tone === 'down'
                                ? colors.error
                                : colors.text,
                        },
                      ]}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))
              )}
            </Animated.View>
          );
        })()}

        {judgeLine || matchupNote ? (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.base).delay(180)
            }
          >
            <GameBevel color={colors.ornamentMuted} />
            <Text
              variant="title"
              style={[styles.cardTitle, { color: colors.text }]}
              accessibilityRole="header"
            >
              Judge’s line
            </Text>
            {judgeLine ? (
              <Text
                style={[styles.explanation, { color: colors.textSecondary }]}
              >
                {judgeLine}
              </Text>
            ) : null}
            {matchupNote ? (
              <Text
                style={[styles.matchupNote, { color: colors.textTertiary }]}
              >
                {matchupNote}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}

        <TutorialCoach battleId={battleId} stage="result" />

        {/* Share actions */}
        <TouchableOpacity
          style={[styles.shareButton, { backgroundColor: colors.primary }]}
          onPress={handleShareCard}
          disabled={isSharing || noContest}
          accessibilityLabel="Share result card image"
          accessibilityRole="button"
          accessibilityState={{
            disabled: isSharing || noContest,
            busy: isSharing,
          }}
        >
          {isSharing ? (
            <ActivityIndicator color={inkFor(colors.primary)} />
          ) : (
            <View style={styles.buttonRow}>
              <GameSymbol
                name="share-outline"
                size={18}
                color={inkFor(colors.primary)}
              />
              <Text
                style={[
                  styles.shareButtonText,
                  { color: inkFor(colors.primary) },
                ]}
              >
                Share result card
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {videoUrl ? (
          <TouchableOpacity
            style={[styles.shareVideoButton, { borderColor: colors.primary }]}
            onPress={handleShareVideo}
            disabled={isSharing || revised}
            accessibilityLabel="Share cinematic video"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSharing || revised }}
          >
            <View style={styles.buttonRow}>
              <GameSymbol
                name="film-outline"
                size={18}
                color={colors.primary}
              />
              <Text
                style={[styles.shareVideoButtonText, { color: colors.primary }]}
              >
                {revised
                  ? 'Original cinematic — sharing unavailable'
                  : 'Share cinematic video'}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Cinematic video: player, status, or the offer. */}
        {media.playbackError || media.captionError ? (
          <View style={{ paddingVertical: 16, gap: 8 }}>
            <Text style={{ color: colors.textSecondary }}>
              {media.playbackError
                ? 'Your cinematic is generated, but playback is unavailable.'
                : 'Captions could not be loaded. Video is still available.'}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => void media.retry()}
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.primary }}>
                Retry loading media · free
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {videoUrl ? (
          <View style={styles.videoCard}>
            <Text
              variant="title"
              style={[styles.videoCardTitle, { color: colors.text }]}
            >
              Cinematic video
            </Text>
            <VideoView
              player={player}
              style={styles.videoView}
              nativeControls
              contentFit="cover"
            />
            {captionLines.length > 0 ? (
              <View
                style={styles.captionsContainer}
                accessibilityLabel={`Captions: ${captionLines.length} lines`}
              >
                <Text style={[styles.captionsTitle, { color: colors.text }]}>
                  Captions
                </Text>
                {captionLines.map((line, idx) => (
                  <Text
                    key={`${line.start_ms}-${idx}`}
                    style={styles.captionLine}
                  >
                    <Text style={{ color: colors.textSecondary }}>
                      {formatTimestamp(line.start_ms)}
                    </Text>
                    <Text
                      style={{ color: colors.text }}
                    >{`  ${line.text}`}</Text>
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {statusCopy ? (
          <View
            style={[styles.card, { backgroundColor: colors.card }]}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${statusCopy.title}. ${statusCopy.body}`}
          >
            <GameBevel color={colors.ornamentMuted} />
            <Text
              variant="title"
              style={[styles.cardTitle, { color: colors.text }]}
            >
              {statusCopy.title}
            </Text>
            <View style={styles.statusRow}>
              {statusCopy.tone === 'error' ? (
                <GameSymbol
                  name="close-circle"
                  size={16}
                  color={colors.error}
                />
              ) : (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              )}
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                {statusCopy.body}
              </Text>
            </View>
          </View>
        ) : null}

        {offerUpgrade ? (
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: colors.primary }]}
            ref={upgradeFocusRef}
            onPress={handleUpgradePreview}
            disabled={isCheckingUpgrade}
            accessibilityLabel="Get the cinematic video. Shows the cost before anything is spent."
            accessibilityRole="button"
            accessibilityState={{
              disabled: isCheckingUpgrade,
              busy: isCheckingUpgrade,
            }}
          >
            {isCheckingUpgrade ? (
              <ActivityIndicator color={inkFor(colors.primary)} />
            ) : (
              <>
                <View style={styles.buttonRow}>
                  <GameSymbol
                    name="film-outline"
                    size={20}
                    color={inkFor(colors.primary)}
                  />
                  <Text
                    style={[
                      styles.upgradeButtonText,
                      { color: inkFor(colors.primary) },
                    ]}
                  >
                    {videoJob?.status === 'failed'
                      ? 'Try the video again'
                      : 'Get the cinematic video'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.upgradeButtonSubtext,
                    { color: inkFor(colors.primary) },
                  ]}
                >
                  See the cost before you commit
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {canAppeal || appeal.data?.appeal ? (
          <BattleAppealPanel review={appeal} />
        ) : null}

        <TouchableOpacity
          style={styles.reportLink}
          onPress={handleReport}
          accessibilityLabel={
            opponentProfileId
              ? 'Report this battle or block opponent'
              : 'Report this battle'
          }
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        >
          <Text
            style={[styles.reportLinkText, { color: colors.textSecondary }]}
          >
            {opponentProfileId ? 'Report / Block' : 'Report this battle'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <GameFooter style={{ paddingBottom: insets.bottom + Spacing.sm }}>
        <View style={styles.actionsRow}>
          <GameButton
            style={{ flex: 1 }}
            tone="secondary"
            label="Back to Arena"
            onPress={goHome}
          />
          <GameButton
            style={{ flex: 1 }}
            ref={battleAgainFocusRef}
            label="Battle Again"
            accessibilityLabel="Battle again"
            onPress={() => {
              void recordFunnelEvent('result_next_battle', battleId);
              router.replace('/create');
            }}
          />
        </View>
      </GameFooter>

      <ConfirmSheet
        visible={sheet !== null}
        returnFocusRef={upgradeReturnFocusRef}
        title={sheet?.title ?? ''}
        subtitle={
          finalRound
            ? `Cinematic for round ${finalRound.round_number}. ${sheet?.subtitle ?? ''}`
            : sheet?.subtitle
        }
        lines={sheet?.lines}
        rows={sheet?.rows}
        confirmLabel={sheet?.confirmLabel ?? 'Confirm'}
        busy={isUpgrading}
        onConfirm={handleUpgradeConfirm}
        onCancel={() => {
          if (!isUpgrading) setUpgradePreview(null);
        }}
      />

      <ReportBlockSheet
        visible={showReportSheet}
        onClose={() => setShowReportSheet(false)}
        reportedType="battle"
        reportedId={battleId as string}
        reportedProfileId={opponentProfileId}
        subjectLabel="this battle"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: Spacing.sm,
  },
  content: {
    padding: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  replayRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.xs,
  },
  replayButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  replayText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  card: {
    borderRadius: 0,
    padding: Spacing.lg,

    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    marginBottom: Spacing.sm,
  },
  cardText: {
    fontSize: Typography.sizes.base,
    flexShrink: 1,
  },
  explanation: {
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * 1.4,
  },
  matchupNote: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
  },
  videoCard: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    backgroundColor: '#000',
  },
  videoView: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: '#000',
  },
  videoCardTitle: {
    fontSize: Typography.sizes.lg,
    padding: Spacing.md,
  },
  captionsContainer: {
    padding: Spacing.md,
  },
  captionsTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  captionLine: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.xs,
  },
  upgradeButton: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  upgradeButtonText: {
    flexShrink: 1,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  upgradeButtonSubtext: {
    fontSize: Typography.sizes.sm,
  },
  appealButton: {
    minHeight: 48,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  appealButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rewardText: { flex: 1, gap: 2 },
  rewardLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  rewardDetail: {
    fontSize: 14,
  },
  rewardValue: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
    textAlign: 'right',
    flexShrink: 0,
  },
  shareCapture: {
    borderRadius: BorderRadius.xl,
    // Breathing room so the exported PNG does not crop tight to the card.
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  shareButton: {
    minHeight: 48,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  shareButtonText: {
    flexShrink: 1,
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  shareVideoButton: {
    minHeight: 48,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  shareVideoButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  actionsRow: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  actionButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  actionButtonTextWhite: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  reportLink: {
    alignSelf: 'center',
    minHeight: 48,
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  reportLinkText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textDecorationLine: 'underline',
  },
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  miniBadge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  miniBody: {
    flex: 1,
  },
  miniTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  miniLine: {
    fontSize: Typography.sizes.sm,
  },
});

/**
 * One row of the round-by-round card. Colour, glyph and words all carry the
 * outcome, and the outcome comes from `round_winner_id`, never from comparing
 * scores (see `roundMiniView`).
 */
function RoundMiniCard({
  round,
  myProfileId,
  playerOneId,
}: {
  round: BattleRound;
  myProfileId: string | null;
  playerOneId: string | null;
}) {
  const colors = useThemedColors();
  const view = roundMiniView(round, { myProfileId, playerOneId });

  const tone =
    view.outcome === 'won'
      ? colors.success
      : view.outcome === 'lost'
        ? colors.error
        : view.outcome === 'draw'
          ? colors.warning
          : colors.textTertiary;
  const icon: React.ComponentProps<typeof GameSymbol>['name'] =
    view.outcome === 'won'
      ? 'checkmark'
      : view.outcome === 'lost'
        ? 'close'
        : view.outcome === 'draw'
          ? 'remove'
          : 'time-outline';

  const title = `Round ${round.round_number} · ${view.status}${
    view.scoreLine ? ` · ${view.scoreLine}` : ''
  }`;

  return (
    <View
      style={[styles.miniCard, { borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${title}. ${view.hpLine}`}
    >
      <View style={[styles.miniBadge, { backgroundColor: tone }]}>
        <GameSymbol name={icon} size={18} color={inkFor(tone)} />
      </View>
      <View style={styles.miniBody}>
        <Text
          style={[styles.miniTitle, NumericFontVariant, { color: colors.text }]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.miniLine,
            NumericFontVariant,
            { color: colors.textSecondary },
          ]}
        >
          {view.hpLine}
        </Text>
      </View>
    </View>
  );
}
