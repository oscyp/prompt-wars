import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { appealBattle } from '@/utils/battles';
import { requestVideoUpgrade } from '@/utils/monetization';
import { reportContent } from '@/utils/safety';
import { useAuth } from '@/providers/AuthProvider';
import {
  Card,
  GlowGradientButton,
  ScreenContainer,
  SectionHeader,
} from '@/components';

type Outcome = 'win' | 'loss' | 'draw';

const OUTCOME_META: Record<
  Outcome,
  {
    label: string;
    gradient: readonly string[];
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    glow: string;
  }
> = {
  win: {
    label: 'VICTORY',
    gradient: Gradients.victory,
    icon: 'crown',
    glow: '#FFD700',
  },
  loss: {
    label: 'DEFEAT',
    gradient: Gradients.defeat,
    icon: 'skull-outline',
    glow: '#EF4444',
  },
  draw: {
    label: 'DRAW',
    gradient: Gradients.draw,
    icon: 'equal',
    glow: '#94A3B8',
  },
};

export default function ResultScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { battle, videoJob, refetch } = useRealtimeBattle(battleId || null);
  const [isAppealing, setIsAppealing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [hapticPlayed, setHapticPlayed] = useState(false);

  useEffect(() => {
    if (!battle) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isWinner = battle?.winner_id === user?.id;
  const isDraw = battle?.is_draw;
  const outcome: Outcome | null = battle
    ? isDraw
      ? 'draw'
      : isWinner
      ? 'win'
      : 'loss'
    : null;
  const canAppeal = !isWinner && !isDraw && battle?.mode === 'ranked';

  // Haptic on outcome reveal
  useEffect(() => {
    if (!outcome || hapticPlayed) return;
    if (outcome === 'win') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (outcome === 'loss') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setHapticPlayed(true);
  }, [outcome, hapticPlayed]);

  const handleAppeal = () => {
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
                Alert.alert(
                  'Appeal Submitted',
                  result.message || 'Your appeal is being reviewed'
                );
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
      const preview = await requestVideoUpgrade(battleId as string, false);
      if (preview.can_upgrade) {
        const costInfo = preview.entitlement_check;
        const message =
          costInfo?.method === 'subscription_allowance'
            ? `Use 1 of ${costInfo.allowance_remaining} monthly video reveals?`
            : `Upgrade to cinematic video for ${costInfo?.cost_credits || 0} credits?`;
        Alert.alert('Upgrade to Tier 1 Video', message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => handleUpgradeConfirm() },
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
        Alert.alert(
          'Video Queued',
          'Your cinematic video is generating. You will be notified when ready.'
        );
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

  if (!battle || !outcome) {
    return (
      <ScreenContainer padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  const meta = OUTCOME_META[outcome];
  const tier0 = battle.tier0_reveal_payload;
  const scores = battle.score_payload;

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Outcome hero */}
        <LinearGradient
          colors={meta.gradient as unknown as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.outcomeHero,
            Shadows.cardElevated,
            { shadowColor: meta.glow },
          ]}
        >
          <View style={styles.outcomeIconWrap}>
            <MaterialCommunityIcons name={meta.icon} size={56} color="#FFFFFF" />
          </View>
          <Text style={styles.outcomeLabel}>{meta.label}</Text>
          {battle.winner_id && !isDraw && (
            <Text style={styles.outcomeSub}>
              {isWinner ? 'You claimed glory.' : 'The arena claims another.'}
            </Text>
          )}
        </LinearGradient>

        {/* Summary */}
        {tier0 && (
          <Card variant="glass" style={styles.section}>
            <SectionHeader title="Battle Summary" size="sm" />
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              {tier0.summary || 'Tier 0 reveal rendered'}
            </Text>
          </Card>
        )}

        {/* Score */}
        {scores && (
          <Card variant="glass" style={styles.section}>
            <SectionHeader title="Judge Scores" size="sm" />
            <Text style={[styles.bodyTextItalic, { color: colors.textSecondary }]}>
              {scores.explanation || 'Battle was scored by AI judge'}
            </Text>
          </Card>
        )}

        {/* Video upgrade */}
        {battle.status === 'result_ready' && !videoJob && (
          <View style={styles.section}>
            <GlowGradientButton
              title={isUpgrading ? 'Checking…' : 'Upgrade to Cinematic Video'}
              onPress={handleUpgradePreview}
              variant="finisher"
              size="lg"
              loading={isUpgrading}
              fullWidth
              iconLeft="video-vintage"
              accessibilityLabel="Upgrade to cinematic video"
            />
            <Text style={[styles.upgradeHint, { color: colors.textTertiary }]}>
              See the battle come to life
            </Text>
          </View>
        )}

        {/* Video status */}
        {videoJob && (
          <Card variant="neon" style={styles.section}>
            <SectionHeader title="Video Status" size="sm" />
            <View style={styles.videoStatusRow}>
              <MaterialCommunityIcons
                name={
                  videoJob.status === 'succeeded'
                    ? 'check-circle'
                    : videoJob.status === 'failed'
                    ? 'close-circle'
                    : 'progress-clock'
                }
                size={20}
                color={
                  videoJob.status === 'succeeded'
                    ? colors.success
                    : videoJob.status === 'failed'
                    ? colors.error
                    : colors.accent
                }
              />
              <Text style={[styles.bodyText, { color: colors.text }]}>
                {videoJob.status === 'succeeded'
                  ? 'Video ready!'
                  : videoJob.status === 'failed'
                  ? 'Generation failed'
                  : `${videoJob.status}…`}
              </Text>
            </View>
            {videoJob.moderation_status === 'pending' && (
              <Text style={[styles.modText, { color: colors.warning }]}>
                Video pending moderation approval
              </Text>
            )}
          </Card>
        )}

        {/* Appeal */}
        {canAppeal && (
          <View style={styles.section}>
            <GlowGradientButton
              title="Appeal Result (1/day)"
              onPress={handleAppeal}
              variant="ghost"
              size="md"
              loading={isAppealing}
              fullWidth
              iconLeft="scale-balance"
            />
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <View style={styles.actionFlex}>
            <GlowGradientButton
              title="Report"
              onPress={handleReport}
              variant="ghost"
              size="md"
              fullWidth
              iconLeft="flag-outline"
            />
          </View>
          <View style={styles.actionFlex}>
            <GlowGradientButton
              title="Battle Again"
              onPress={() => router.push('/(tabs)/create')}
              variant="primary"
              size="md"
              fullWidth
              iconLeft="sword-cross"
            />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  outcomeHero: {
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  outcomeIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: Spacing.md,
  },
  outcomeLabel: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.hero,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wider,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  outcomeSub: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
    color: 'rgba(255,255,255,0.9)',
    marginTop: Spacing.xs,
    letterSpacing: Typography.letterSpacing.wide,
  },
  section: {
    marginBottom: Spacing.md,
  },
  bodyText: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.base,
    lineHeight: Typography.sizes.base * 1.5,
  },
  bodyTextItalic: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.sm,
    fontStyle: 'italic',
    lineHeight: Typography.sizes.sm * 1.6,
  },
  upgradeHint: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  videoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  modText: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionFlex: {
    flex: 1,
  },
});
