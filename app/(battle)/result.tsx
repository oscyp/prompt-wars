import ResultVerdict, {
  resultFinalHp,
} from '@/components/battle/ResultVerdict';
import BattleBackdrop from '@/components/battle/BattleBackdrop';
import ResultMedia from '@/components/battle/ResultMedia';
import ResultActions from '@/components/battle/ResultActions';
import ResultMediaSection from '@/components/battle/ResultMediaSection';
import { resultRewardsNode } from '@/components/battle/ResultRewards';
import ResultDetails from '@/components/battle/ResultDetails';
import { resultMediaRoundNumber } from '@/components/battle/resultMediaView';
import { buildResultRewardsModel } from '@/components/battle/resultRewardsView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';
import { useSheetReturnFocus } from '@/hooks/useSheetReturnFocus';
import { GameText as Text, GameFooter, GameButton } from '@/components/game';
import { humanOpponentId } from '@/components/BattleOpponentSafety';
import {
  seriesDecisionExplanation,
  isUnratedExhibition,
} from '@/utils/battleExplanation';
import { markBattleResultRead } from '@/utils/battleAttention';
import { useResultMediaRecovery } from '@/hooks/useResultMediaRecovery';
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
import { useVideoPlayer } from 'expo-video';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useCredits } from '@/hooks/useCredits';
import { useBattleCharacters } from '@/hooks/useBattleCharacters';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
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
import { type ResultShareCardProps } from '@/components/ResultShareCard';
import ResultShareExport from '@/components/ResultShareExport';
import { RevealSequence } from '@/components/reveal';
import { orientSeriesScore } from '@/components/SeriesScoreIndicator';
import { shareResultCard, shareBattleVideo } from '@/utils/share';
import { useAuth } from '@/providers/AuthProvider';
import { useComposerResultTelemetry } from '@/hooks/useComposerResultTelemetry';
import { useBattleAudio } from '@/providers/BattleAudioProvider';
import { RewardSummary } from '@/types/battle';
import { revealModelFrom } from '@/utils/revealBeats';
import { revealSeenKey, summaryJudgeLine } from '@/utils/revealLayout';
import {
  RESULT_LOAD_TIMEOUT_MS,
  battleOutcomeFor,
  canOfferVideoUpgrade,
  outcomeAnnouncement,
  outcomeHeadline,
  ratingSummary,
  singleMatchupNote,
  upgradeBlockedCopy,
  upgradeSheetCopy,
  videoStatusCopy,
} from '@/utils/resultView';

type ScorePayload = {
  explanation?: string;
  move_type_matchup?: { player_one?: string; player_two?: string };
  rating_gated?: string;
} | null;

type RatingDeltaPayload = Record<string, { delta?: unknown }> | null;

/** Statuses that carry a result the reveal can play. */
const RESOLVED_STATUSES = new Set([
  'result_ready',
  'generating_video',
  'completed',
]);

/** Result is reached by replace; "Back to Arena" is the way out. */
const HEADER_OPTIONS = { headerShown: false };

export default function ResultScreen() {
  const colors = useThemedColors();
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
  const { p1, p2, portraitsResolved, refreshPortraits } = useBattleCharacters(
    battleId || null,
    battle,
  );
  const {
    credits,
    loading: creditsLoading,
    error: creditsError,
  } = useCredits(user?.id ?? null);
  const appeal = useBattleAppeal(battleId || null, user?.id || null, refetch);
  const rounds = reviewedRounds(
    originalRounds,
    battle?.resolution_metadata,
    battle?.player_one_id || '',
    battle?.player_two_id || null,
  );
  const revised = (battle?.adjudication_revision ?? 0) > 0;
  const reviewStatus =
    (battle?.resolution_metadata as { status?: string } | null)?.status ?? null;
  const noContest = reviewStatus === 'no_contest';
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

  const [exportRevision, setExportRevision] = useState<string | null>(null);
  const resultRevision = `${user?.id}:${battleId}:${battle?.adjudication_revision ?? 0}`;
  const currentRevision = useRef(resultRevision);
  currentRevision.current = resultRevision;
  useEffect(() => {
    setUpgradePreview(null);
    setIsCheckingUpgrade(false);
    setIsUpgrading(false);
  }, [resultRevision]);
  useEffect(() => {
    if (exportRevision && exportRevision !== resultRevision) {
      setExportRevision(null);
      setIsSharing(false);
      Alert.alert(
        'Result updated',
        'Review the updated result before sharing again.',
      );
    }
  }, [exportRevision, resultRevision]);
  useEffect(
    () => () => {
      currentRevision.current = '';
    },
    [],
  );
  const isBo3 = format === 'bo3';

  const [showReportSheet, setShowReportSheet] = useState(false);
  const finalRound = [...rounds]
    .filter((round) => round.status === 'result_ready')
    .sort((a, b) => b.round_number - a.round_number)[0];
  const media = useResultMediaRecovery({
    accountId: user?.id ?? null,
    battleId: battleId ?? null,
    videoJob,
  });
  const { reportPlaybackError } = media;
  const videoUrl = videoJob?.status === 'succeeded' ? media.videoUrl : null;

  // The status copy escalates with elapsed time, so it needs a clock. It only
  // ticks while a job is genuinely pending, and at 15s -- the copy has three
  // stages, not a countdown, and this screen is already animation-heavy.
  const videoStartedAt = videoJob?.created_at ?? null;
  const videoPending =
    Boolean(videoJob) && !videoUrl && videoJob?.status !== 'failed';
  const [videoElapsedMs, setVideoElapsedMs] = useState(0);
  useEffect(() => {
    if (!videoPending || !videoStartedAt) return;
    const startedMs = Date.parse(videoStartedAt);
    if (!Number.isFinite(startedMs)) return;
    const tick = () => setVideoElapsedMs(Date.now() - startedMs);
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [videoPending, videoStartedAt]);

  // The status card is a polite live region, but the player that REPLACES it
  // announces nothing -- so for a screen-reader user the cinematic simply
  // stopped being mentioned. Say it arrived, once.
  const announcedVideoRef = useRef(false);
  useEffect(() => {
    if (!videoUrl || announcedVideoRef.current) return;
    announcedVideoRef.current = true;
    AccessibilityInfo.announceForAccessibility(
      'Your cinematic is ready to play.',
    );
  }, [videoUrl]);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.audioMixingMode = 'auto';
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
  const trackComposerResult = useComposerResultTelemetry(
    myId,
    battleId,
    battle?.prompt_experience_version === 2,
  );
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
    const requestedRevision = currentRevision.current;

    setIsCheckingUpgrade(true);
    try {
      const preview = await requestVideoUpgrade(
        battleId as string,
        false,
        finalRound?.id,
      );
      if (requestedRevision !== currentRevision.current) return;

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
          creditsLoading || creditsError ? null : credits,
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
      if (requestedRevision !== currentRevision.current) return;
      Alert.alert(
        'Couldn’t start the video',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      if (requestedRevision === currentRevision.current)
        setIsCheckingUpgrade(false);
    }
  };

  /** Step 2: the player has seen the price and tapped confirm. */
  const handleUpgradeConfirm = async () => {
    if (!battleId || !upgradePreview?.can_upgrade || isUpgrading) return;
    const requestedRevision = currentRevision.current;

    setIsUpgrading(true);
    try {
      const result = await requestVideoUpgrade(
        battleId as string,
        true,
        finalRound?.id,
        upgradePreview ?? undefined,
      );
      if (requestedRevision !== currentRevision.current) return;
      if (result.quote_changed && result.entitlement_check) {
        setUpgradePreview(result.entitlement_check);
        Alert.alert(
          'Cinematic quote changed',
          'Review the updated length and cost, then confirm again. Nothing was spent.',
        );
      } else if (result.success || result.already_requested) {
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
      if (requestedRevision !== currentRevision.current) return;
      Alert.alert(
        'Couldn’t start the video',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      if (requestedRevision === currentRevision.current) setIsUpgrading(false);
    }
  };

  // Opens the report sheet, which carries the reason picker and the
  // "also block" option (App Store 1.2 requires both report and block).
  const handleReport = () => {
    if (!battleId) return;
    setShowReportSheet(true);
  };

  const handleShareCard = () => {
    setIsSharing(true);
    setExportRevision(resultRevision);
  };
  const exportReady = async (ref: React.RefObject<View | null>) => {
    const revision = exportRevision;
    try {
      const shared = await shareResultCard(
        ref,
        () => currentRevision.current === revision,
      );
      if (!shared)
        Alert.alert(
          'Sharing unavailable',
          'Sharing is not available on this device.',
        );
    } catch (error) {
      Alert.alert(
        'Couldn’t share',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setExportRevision(null);
      setIsSharing(false);
    }
  };
  const exportFailed = () => {
    refreshPortraits();
    setExportRevision(null);
    setIsSharing(false);
    Alert.alert(
      'Artwork not ready',
      'The card could not finish loading. Check your connection and try sharing again.',
    );
  };

  const handleShareVideo = async () => {
    if (revised) return;
    if (!videoUrl) return;
    const revision = resultRevision;
    setIsSharing(true);
    try {
      const shared = await shareBattleVideo(
        videoUrl,
        () => currentRevision.current === revision,
      );
      if (!shared) {
        Alert.alert(
          'Sharing unavailable',
          'Sharing is not available on this device.',
        );
      }
    } catch (error) {
      Alert.alert(
        'Couldn’t share',
        error instanceof Error
          ? error.message
          : 'The video could not be shared.',
      );
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
            paddingTop: Spacing.md,
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
              accessibilityLabel="Arena"
            >
              <Text style={[styles.actionButtonText, { color: colors.text }]}>
                Arena
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
        <Stack.Screen options={{ ...HEADER_OPTIONS, headerShown: false }} />
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
      ? videoStatusCopy({
          status: videoJob.status,
          hasUrl: false,
          elapsedMs: videoElapsedMs,
        })
      : null;
  const sheet = upgradePreview
    ? upgradeSheetCopy(
        upgradePreview,
        creditsLoading || creditsError ? null : credits,
      )
    : null;

  const winnerSide: 'me' | 'them' | null =
    isDraw || noContest ? null : isWinner ? 'me' : 'them';
  const finalHp = resultFinalHp({
    round: finalRound,
    battle,
    isPlayerOne,
    noContest,
  });
  const mediaRoundNumber = resultMediaRoundNumber(videoJob, originalRounds);
  const videoPlayable = Boolean(videoUrl && !media.playbackError);
  const showMediaSection = Boolean(
    videoUrl || statusCopy || media.playbackError,
  );
  const rewardsModel = buildResultRewardsModel({
    outcome,
    isBot,
    mode: battle.mode,
    exhibition,
    reviewStatus,
    rating,
    reward,
    battleCompleted: battle.status === 'completed',
  });
  const accentColor =
    (revised ? null : model.winnerColor) ??
    (winnerSide === 'me'
      ? (me?.signatureColor ?? model.me.signatureColor)
      : winnerSide === 'them'
        ? (them?.signatureColor ?? model.them.signatureColor)
        : null);

  const resultCard: ResultShareCardProps = {
    headline,
    adjudicationRevision: battle.adjudication_revision ?? 0,
    outcome: noContest ? 'no_contest' : outcome,
    isKo: noContest
      ? false
      : revised
        ? rounds.some((r) => r.is_ko)
        : model.isKo,
    scoreLine: isBo3 && !noContest ? `${mine}–${theirs}` : null,
    me: {
      name: me?.name ?? model.me.name,
      archetype: me?.archetype ?? model.me.archetype,
      avatarUrl: me?.portraitUrl ?? model.me.portraitUrl,
      signatureColor: me?.signatureColor ?? model.me.signatureColor,
      cosmetics: me?.cosmetics,
    },
    them: {
      name: them?.name ?? model.them.name,
      archetype: them?.archetype ?? model.them.archetype,
      avatarUrl: them?.portraitUrl ?? model.them.portraitUrl,
      signatureColor: them?.signatureColor ?? model.them.signatureColor,
      cosmetics: them?.cosmetics,
    },
    winnerSide,
    theme: battle.theme,
    accentColor,
    ratingLine: rewardsModel.correctionLine ?? rating.line,
  };

  return (
    <View style={{ flex: 1 }}>
      <BattleBackdrop theme={battle.theme} />
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <Stack.Screen options={HEADER_OPTIONS} />
        {exportRevision === resultRevision && (
          <ResultShareExport
            key={`${exportRevision}:${resultCard.me.avatarUrl}:${resultCard.them.avatarUrl}`}
            card={resultCard}
            portraitsResolved={portraitsResolved}
            onReady={exportReady}
            onError={exportFailed}
          />
        )}
        <ScrollView
          style={[styles.container, { backgroundColor: 'transparent' }]}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Spacing.md,
              paddingBottom: Spacing.xl,
            },
          ]}
        >
          <View style={styles.verdictSection}>
            <ResultVerdict
              outcome={resultCard.outcome}
              isKo={resultCard.isKo}
              scoreLine={resultCard.scoreLine}
              ratingLine={resultCard.ratingLine}
              adjudicationRevision={resultCard.adjudicationRevision}
              winnerSide={resultCard.winnerSide}
              exhibition={exhibition}
              finalHp={finalHp}
              me={{ ...resultCard.me, role: 'You' }}
              them={{
                ...resultCard.them,
                role: isBot ? 'AI opponent' : 'Opponent',
                isBot,
              }}
            />
          </View>
          <ResultMediaSection
            showMedia={showMediaSection}
            media={
              <ResultMedia
                videoUrl={videoUrl}
                player={player}
                playbackError={media.playbackError}
                retry={() => void media.retry()}
                status={statusCopy}
                revised={revised}
                roundNumber={mediaRoundNumber}
              />
            }
            actions={
              <ResultActions
                videoPlayable={videoPlayable}
                revised={revised}
                busy={isSharing}
                onShareCard={handleShareCard}
                onShareVideo={() => void handleShareVideo()}
                onReplay={handleReplay}
              />
            }
            rewards={resultRewardsNode(rewardsModel)}
          />

          {offerUpgrade ? (
            <View style={styles.upgradeOffer}>
              <GameButton
                ref={upgradeFocusRef}
                label={
                  videoJob?.status === 'failed'
                    ? 'Try the video again'
                    : 'Get the cinematic video'
                }
                icon="film-outline"
                tone="secondary"
                chrome="utility"
                busy={isCheckingUpgrade}
                onPress={handleUpgradePreview}
                accessibilityHint="Shows the cost before anything is spent."
              />
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                See the cost before you commit
              </Text>
            </View>
          ) : null}

          <ResultDetails
            key={battleId}
            theme={battle.theme}
            isBo3={isBo3}
            rounds={rounds}
            myProfileId={myId}
            playerOneId={battle.player_one_id}
            noContest={noContest}
            info={{
              rewards: rewardsModel,
              decisionExplanation,
              judgeLine,
              matchupNote,
              judgeNotesHistorical: revised,
            }}
            onViewQuests={goHome}
            onExplanationOpen={(roundNumber) =>
              trackComposerResult('composer_explanation_read', roundNumber)
            }
          />
          <TutorialCoach battleId={battleId} stage="result" />

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
              label="Arena"
              onPress={goHome}
            />
            <GameButton
              style={{ flex: 1 }}
              ref={battleAgainFocusRef}
              label="Battle Again"
              accessibilityLabel="Battle again"
              onPress={() => {
                void recordFunnelEvent('result_next_battle', battleId);
                trackComposerResult(
                  'composer_next_battle',
                  finalRound?.round_number ?? 1,
                );
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
          confirmDisabled={!upgradePreview?.can_upgrade}
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
      </SafeAreaView>
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
    paddingHorizontal: Spacing.md,
    gap: 20,
  },
  verdictSection: {
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  upgradeOffer: { gap: Spacing.sm },
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
  shareCapture: {
    borderRadius: BorderRadius.xl,
    // Breathing room so the exported PNG does not crop tight to the card.
    padding: Spacing.sm,
    marginBottom: Spacing.md,
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
  },
  reportLinkText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    textDecorationLine: 'underline',
  },
});
