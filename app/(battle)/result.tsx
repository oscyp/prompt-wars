import React, { useEffect, useRef, useState } from 'react';
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
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Spacing, Typography, NumericFontVariant, Motion, Elevation } from '@/constants/DesignTokens';
import { hapticVictory, hapticDefeat, hapticDraw } from '@/utils/haptics';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { useRevealAudio } from '@/hooks/useRevealAudio';
import { appealBattle } from '@/utils/battles';
import { devGenerateVideo } from '@/utils/devVideo';
import { requestVideoUpgrade } from '@/utils/monetization';
import { reportContent } from '@/utils/safety';
import { shareResultCard, shareBattleVideo } from '@/utils/share';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { BattleRound } from '@/types/battle';
import type { Tier0Payload } from '@/components/RoundResultCinematic';

type CaptionLine = { start_ms: number; end_ms: number; text: string };

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function ResultScreen() {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const { user } = useAuth();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const {
    battle,
    videoJob,
    refetch,
    format,
    series_score,
    rounds,
  } = useRealtimeBattle(battleId || null);
  const [isAppealing, setIsAppealing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isDevGenerating, setIsDevGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [captionLines, setCaptionLines] = useState<CaptionLine[]>([]);
  const cardRef = useRef<View>(null);
  const isBo3 = format === 'bo3';

  const videoUrl =
    videoJob?.status === 'succeeded' && videoJob.video_url
      ? videoJob.video_url
      : null;
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    if (!battle) refetch();
  }, [battle, refetch]);

  useEffect(() => {
    let cancelled = false;

    if (videoJob?.status !== 'succeeded' || !battleId || !videoJob?.id) {
      setCaptionLines([]);
      return;
    }

    (async () => {
      try {
        const { data: videoRow, error: videoErr } = await supabase
          .from('videos')
          .select('id')
          .eq('battle_id', battleId)
          .eq('video_job_id', videoJob.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled || videoErr || !videoRow?.id) return;

        const { data: captionRow, error: captionErr } = await supabase
          .from('video_captions')
          .select('json_payload')
          .eq('video_id', videoRow.id)
          .eq('locale', 'en-US')
          .maybeSingle();

        if (cancelled || captionErr || !captionRow?.json_payload) return;

        const payload = captionRow.json_payload as {
          lines?: CaptionLine[];
        };
        if (Array.isArray(payload?.lines)) {
          setCaptionLines(payload.lines);
        }
      } catch {
        // Captions are nice-to-have; fail silently.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [battleId, videoJob?.id, videoJob?.status]);

  const isWinner = battle?.winner_id === user?.id;
  const isDraw = battle?.is_draw;
  const canAppeal = !isWinner && !isDraw && battle?.mode === 'ranked';

  // Fire a single outcome haptic once the resolved battle is known.
  const outcomeHapticFired = useRef(false);
  useEffect(() => {
    if (!battle || outcomeHapticFired.current) return;
    const resolved =
      battle.status === 'completed' || battle.status === 'result_ready';
    if (!resolved) return;
    outcomeHapticFired.current = true;
    if (isDraw) hapticDraw();
    else if (isWinner) hapticVictory();
    else hapticDefeat();
  }, [battle, isDraw, isWinner]);

  // Fire the best-effort Tier 0 reveal audio once, when the battle resolves.
  // Non-blocking and gated on the Sound setting inside the controller.
  const revealAudio = useRevealAudio();
  const revealAudioFired = useRef(false);
  useEffect(() => {
    if (!battle || revealAudioFired.current) return;
    const resolved =
      battle.status === 'completed' || battle.status === 'result_ready';
    if (!resolved) return;
    const payload =
      (battle.tier0_reveal_payload as Tier0Payload | null) ?? null;
    if (!payload) return;
    revealAudioFired.current = true;
    revealAudio.play({
      reveal_spec: payload.reveal_spec ?? null,
      battleCryText: payload.battleCryText ?? null,
    });
  }, [battle, revealAudio]);

  const handleAppeal = async () => {
    if (!battleId) return;

    Alert.alert(
      'Appeal Battle',
      'Appeals are limited to 1 per day. A third independent judge will re-evaluate. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Appeal',
          onPress: async () => {
            setIsAppealing(true);
            try {
              const result = await appealBattle(battleId as string);
              if (result.success) {
                Alert.alert('Appeal Submitted', result.message || 'Your appeal is being reviewed');
              } else {
                Alert.alert('Appeal Failed', result.error || 'Unable to submit appeal');
              }
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Appeal failed');
            } finally {
              setIsAppealing(false);
            }
          },
        },
      ]
    );
  };

  const handleUpgradePreview = async () => {
    if (!battleId) return;

    setIsUpgrading(true);
    try {
      // First get cost preview
      const preview = await requestVideoUpgrade(battleId as string, false);

      if (preview.can_upgrade) {
        const costInfo = preview.entitlement_check;
        const message =
          costInfo?.method === 'subscription_allowance'
            ? `Use 1 of ${costInfo.allowance_remaining} monthly video reveals?`
            : `Upgrade to cinematic video for ${costInfo?.cost_credits || 0} credits?`;

        Alert.alert('Upgrade to Tier 1 Video', message, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => handleUpgradeConfirm(),
          },
        ]);
      } else {
        Alert.alert('Cannot Upgrade', preview.entitlement_check?.error || 'Not enough credits');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to check upgrade');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleUpgradeConfirm = async () => {
    if (!battleId) return;

    setIsUpgrading(true);
    try {
      const result = await requestVideoUpgrade(battleId as string, true);
      if (result.success) {
        Alert.alert('Video Queued', 'Your cinematic video is generating. You will be notified when ready.');
        refetch();
      } else {
        Alert.alert('Upgrade Failed', result.error || 'Unable to upgrade');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Upgrade failed');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleDevGenerate = async () => {
    if (!battleId) return;
    Alert.alert(
      'Dev: Generate Real Cinematic',
      'This will queue a real xAI video generation (free in dev). It can take up to ~2.5 minutes. The placeholder will be replaced. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          onPress: async () => {
            setIsDevGenerating(true);
            try {
              const r = await devGenerateVideo(battleId as string);
              if (r.success) {
                Alert.alert('Generating', 'xAI generation submitted. The video will appear here automatically when ready.');
                refetch();
              } else {
                Alert.alert('Dev Generation Failed', r.error || 'Unknown error');
              }
            } finally {
              setIsDevGenerating(false);
            }
          },
        },
      ]
    );
  };

  const handleReport = () => {
    if (!battleId) return;
    Alert.alert('Report Battle', 'Report this battle for review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          try {
            await reportContent({
              reportedType: 'battle',
              reportedId: battleId as string,
              reason: 'inappropriate',
            });
            Alert.alert('Report Submitted', 'Thank you for your report');
          } catch (err) {
            Alert.alert('Error', 'Failed to submit report');
          }
        },
      },
    ]);
  };

  const handleShareCard = async () => {
    setIsSharing(true);
    try {
      const shared = await shareResultCard(cardRef);
      if (!shared) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
      }
    } catch {
      Alert.alert('Error', 'Could not share the result card.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleShareVideo = async () => {
    if (!videoUrl) return;
    setIsSharing(true);
    try {
      const shared = await shareBattleVideo(videoUrl);
      if (!shared) {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
      }
    } catch {
      Alert.alert('Error', 'Could not share the video.');
    } finally {
      setIsSharing(false);
    }
  };

  if (!battle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const tier0 = battle.tier0_reveal_payload as { summary?: string } | null;
  const scores = battle.score_payload as { explanation?: string } | null;
  const seriesHeader = isBo3
    ? `${series_score.p1}–${series_score.p2} ${
        isDraw ? 'Draw' : isWinner ? 'Victory' : 'Defeat'
      }`
    : null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Shareable scorecard region (captured by react-native-view-shot) */}
        <View
          ref={cardRef}
          collapsable={false}
          style={[styles.shareCapture, { backgroundColor: colors.background }]}
        >
          {/* Result Header */}
          <Animated.View
            style={[styles.resultHeader, { backgroundColor: colors.card }]}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.slow)
            }
          >
          {isDraw ? (
            <MaterialCommunityIcons
              name="handshake"
              size={64}
              color={colors.warning}
              style={styles.resultIcon}
            />
          ) : isWinner ? (
            <Ionicons
              name="trophy"
              size={64}
              color={colors.success}
              style={styles.resultIcon}
            />
          ) : (
            <MaterialCommunityIcons
              name="heart-broken"
              size={64}
              color={colors.error}
              style={styles.resultIcon}
            />
          )}
          <Text style={[styles.resultText, NumericFontVariant, { color: colors.text }]}>
            {seriesHeader ?? (isDraw ? 'DRAW' : isWinner ? 'VICTORY' : 'DEFEAT')}
          </Text>
          {!isDraw && battle.winner_id && (
            <Text style={[styles.winnerText, { color: colors.textSecondary }]}>
              Winner: {isWinner ? 'You' : 'Opponent'}
            </Text>
          )}
        </Animated.View>

        {isBo3 ? (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.base).delay(80)
            }
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Round-by-Round
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
                  isPlayerOne={battle.player_one_id === user?.id}
                />
              ))
            )}
          </Animated.View>
        ) : null}

        {/* Tier 0 Reveal Info */}
        {tier0 && (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.base).delay(120)
            }
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>Battle Summary</Text>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              {tier0.summary || 'Tier 0 reveal rendered'}
            </Text>
          </Animated.View>
        )}

        {/* Score Breakdown */}
        {scores && (
          <Animated.View
            style={[styles.card, { backgroundColor: colors.card }]}
            entering={
              reduceMotion
                ? undefined
                : FadeInDown.duration(Motion.durations.base).delay(180)
            }
          >
            <Text style={[styles.cardTitle, { color: colors.text }]}>Judge Scores</Text>
            <Text style={[styles.explanation, { color: colors.textSecondary }]}>
              {scores.explanation || 'Battle was scored by AI judge'}
            </Text>
          </Animated.View>
        )}
        </View>
        {/* End shareable scorecard region */}

        {/* Share actions */}
        <TouchableOpacity
          style={[styles.shareButton, { backgroundColor: colors.primary }]}
          onPress={handleShareCard}
          disabled={isSharing}
          accessibilityLabel="Share result card image"
          accessibilityRole="button"
        >
          {isSharing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.buttonRow}>
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>Share Result Card</Text>
            </View>
          )}
        </TouchableOpacity>

        {videoUrl && (
          <TouchableOpacity
            style={[styles.shareVideoButton, { borderColor: colors.primary }]}
            onPress={handleShareVideo}
            disabled={isSharing}
            accessibilityLabel="Share cinematic video"
            accessibilityRole="button"
          >
            <View style={styles.buttonRow}>
              <Ionicons name="film-outline" size={18} color={colors.primary} />
              <Text style={[styles.shareVideoButtonText, { color: colors.primary }]}>
                Share Cinematic Video
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Cinematic Video */}
        {videoUrl ? (
          <View style={styles.videoCard}>
            <Text style={[styles.videoCardTitle, { color: colors.text }]}>
              Cinematic Reveal
            </Text>
            <VideoView
              player={player}
              style={styles.videoView}
              nativeControls
              contentFit="cover"
            />
            {captionLines.length > 0 && (
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
                    <Text style={{ color: colors.text }}>{`  ${line.text}`}</Text>
                  </Text>
                ))}
              </View>
            )}
            {videoJob?.moderation_status === 'pending' && (
              <Text
                style={[
                  styles.moderationText,
                  { color: colors.warning, padding: Spacing.md },
                ]}
              >
                Video pending moderation approval
              </Text>
            )}
          </View>
        ) : videoJob ? (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Video Status</Text>
            <View style={styles.statusRow}>
              <Ionicons
                name={videoJob.status === 'failed' ? 'close-circle' : 'hourglass-outline'}
                size={16}
                color={videoJob.status === 'failed' ? colors.error : colors.textSecondary}
              />
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                {videoJob.status === 'failed'
                  ? 'Generation failed'
                  : 'Generating cinematic...'}
              </Text>
            </View>
            {videoJob.moderation_status === 'pending' && (
              <Text style={[styles.moderationText, { color: colors.warning }]}>
                Video pending moderation approval
              </Text>
            )}
          </View>
        ) : (
          battle.status === 'result_ready' &&
          battle.mode !== 'bot' && (
            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: colors.primary }]}
              onPress={handleUpgradePreview}
              disabled={isUpgrading}
              accessibilityLabel="Upgrade to cinematic video"
              accessibilityRole="button"
            >
              {isUpgrading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <View style={styles.buttonRow}>
                    <Ionicons name="film-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.upgradeButtonText}>Upgrade to Cinematic Video</Text>
                  </View>
                  <Text style={styles.upgradeButtonSubtext}>See the battle come to life</Text>
                </>
              )}
            </TouchableOpacity>
          )
        )}

        {__DEV__ && (
          <TouchableOpacity
            style={[styles.devButton, { borderColor: colors.warning }]}
            onPress={handleDevGenerate}
            disabled={isDevGenerating}
            accessibilityLabel="Dev: generate real cinematic video"
            accessibilityRole="button"
          >
            {isDevGenerating ? (
              <ActivityIndicator color={colors.warning} />
            ) : (
              <>
                <View style={styles.buttonRow}>
                  <Ionicons name="flask-outline" size={16} color={colors.warning} />
                  <Text style={[styles.devButtonText, { color: colors.warning }]}>
                    Dev: Generate Real Cinematic (xAI)
                  </Text>
                </View>
                <Text style={[styles.devButtonSubtext, { color: colors.textSecondary }]}>
                  Replaces placeholder with real xAI generation (~2.5 min)
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Appeal */}
        {canAppeal && (
          <TouchableOpacity
            style={[styles.appealButton, { backgroundColor: colors.warning }]}
            onPress={handleAppeal}
            disabled={isAppealing}
            accessibilityLabel="Appeal battle result"
            accessibilityRole="button"
          >
            {isAppealing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View style={styles.buttonRow}>
                <MaterialCommunityIcons name="scale-balance" size={18} color="#FFFFFF" />
                <Text style={styles.appealButtonText}>Appeal Result (1/day)</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.backgroundTertiary }]}
            onPress={handleReport}
            accessibilityLabel="Report battle"
            accessibilityRole="button"
          >
            <Text style={[styles.actionButtonText, { color: colors.text }]}>Report</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/(tabs)/create')}
            accessibilityLabel="Battle again"
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonTextWhite}>Battle Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
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
  content: {
    padding: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  resultHeader: {
    padding: Spacing.xl,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Elevation.lg,
  },
  resultIcon: {
    marginBottom: Spacing.md,
  },
  resultText: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  winnerText: {
    fontSize: Typography.sizes.base,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  cardText: {
    fontSize: Typography.sizes.base,
  },
  explanation: {
    fontSize: Typography.sizes.sm,
    fontStyle: 'italic',
  },
  moderationText: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.sm,
  },
  videoCard: {
    borderRadius: 12,
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
    fontWeight: Typography.weights.semibold,
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
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  upgradeButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: Typography.sizes.sm,
  },
  devButton: {
    padding: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  devButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  devButtonSubtext: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
  },
  appealButton: {
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  appealButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  shareCapture: {
    borderRadius: 12,
  },
  shareButton: {
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  shareVideoButton: {
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  shareVideoButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  actionButtonTextWhite: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  miniBadgeText: {
    color: '#FFFFFF',
    fontWeight: Typography.weights.bold,
  },
  miniBody: {
    flex: 1,
  },
  miniLine: {
    fontSize: Typography.sizes.sm,
  },
});

function RoundMiniCard({
  round,
  isPlayerOne,
}: {
  round: BattleRound;
  isPlayerOne: boolean;
}) {
  const myScore = isPlayerOne ? round.player_one_score : round.player_two_score;
  const oppScore = isPlayerOne ? round.player_two_score : round.player_one_score;
  const myHp = isPlayerOne ? round.player_one_hp_after : round.player_two_hp_after;
  const oppHp = isPlayerOne ? round.player_two_hp_after : round.player_one_hp_after;
  const isDraw = round.is_draw;
  const isPending = round.status !== 'result_ready';
  const youWon =
    !isPending &&
    !isDraw &&
    round.round_winner_id != null &&
    ((isPlayerOne && (round.player_one_score ?? 0) > (round.player_two_score ?? 0)) ||
      (!isPlayerOne && (round.player_two_score ?? 0) > (round.player_one_score ?? 0)));
  const badgeBg = isPending
    ? '#9CA3AF'
    : isDraw
      ? '#F59E0B'
      : youWon
        ? '#10B981'
        : '#EF4444';
  const status = isPending
    ? 'Pending'
    : isDraw
      ? 'Draw'
      : youWon
        ? 'You won'
        : 'Opponent won';
  return (
    <View style={[styles.miniCard, { borderColor: '#E5E7EB' }]}>
      <View style={[styles.miniBadge, { backgroundColor: badgeBg }]}>
        <Text style={styles.miniBadgeText}>R{round.round_number}</Text>
      </View>
      <View style={styles.miniBody}>
        <Text style={styles.miniLine}>
          {status}
          {' '}
          {myScore != null && oppScore != null
            ? `· ${Number(myScore).toFixed(1)} vs ${Number(oppScore).toFixed(1)}`
            : ''}
        </Text>
        <Text style={styles.miniLine}>
          HP after: {myHp ?? '—'} vs {oppHp ?? '—'}
        </Text>
      </View>
    </View>
  );
}
