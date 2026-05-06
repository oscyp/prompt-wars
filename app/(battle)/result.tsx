import React, { useEffect, useState } from 'react';
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
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { appealBattle } from '@/utils/battles';
import { requestVideoUpgrade } from '@/utils/monetization';
import { reportContent } from '@/utils/safety';
import { useAuth } from '@/providers/AuthProvider';

export default function ResultScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { user } = useAuth();
  const { battleId } = useLocalSearchParams<{ battleId: string }>();

  const { battle, videoJob, refetch } = useRealtimeBattle(battleId || null);
  const [isAppealing, setIsAppealing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);

  useEffect(() => {
    if (!battle) refetch();
  }, []);

  const isWinner = battle?.winner_id === user?.id;
  const isDraw = battle?.is_draw;
  const canAppeal = !isWinner && !isDraw && battle?.mode === 'ranked';

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

  if (!battle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const tier0 = battle.tier0_reveal_payload;
  const scores = battle.score_payload;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Result Header */}
        <View style={[styles.resultHeader, { backgroundColor: colors.card }]}>
          <Text style={[styles.resultEmoji, { color: isDraw ? colors.warning : isWinner ? colors.success : colors.error }]}>
            {isDraw ? '🤝' : isWinner ? '🏆' : '💔'}
          </Text>
          <Text style={[styles.resultText, { color: colors.text }]}>
            {isDraw ? 'DRAW' : isWinner ? 'VICTORY' : 'DEFEAT'}
          </Text>
          {!isDraw && battle.winner_id && (
            <Text style={[styles.winnerText, { color: colors.textSecondary }]}>
              Winner: {isWinner ? 'You' : 'Opponent'}
            </Text>
          )}
        </View>

        {/* Tier 0 Reveal Info */}
        {tier0 && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Battle Summary</Text>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              {tier0.summary || 'Tier 0 reveal rendered'}
            </Text>
          </View>
        )}

        {/* Score Breakdown */}
        {scores && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Judge Scores</Text>
            <Text style={[styles.explanation, { color: colors.textSecondary }]}>
              {scores.explanation || 'Battle was scored by AI judge'}
            </Text>
          </View>
        )}

        {/* Video Upgrade */}
        {battle.status === 'result_ready' && !videoJob && (
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
                <Text style={styles.upgradeButtonText}>🎬 Upgrade to Cinematic Video</Text>
                <Text style={styles.upgradeButtonSubtext}>See the battle come to life</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Video Status */}
        {videoJob && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Video Status</Text>
            <Text style={[styles.cardText, { color: colors.textSecondary }]}>
              {videoJob.status === 'succeeded'
                ? '✓ Video ready!'
                : videoJob.status === 'failed'
                ? '✗ Generation failed'
                : `⏳ ${videoJob.status}...`}
            </Text>
            {videoJob.moderation_status === 'pending' && (
              <Text style={[styles.moderationText, { color: colors.warning }]}>
                Video pending moderation approval
              </Text>
            )}
          </View>
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
              <Text style={styles.appealButtonText}>⚖️ Appeal Result (1/day)</Text>
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
  resultHeader: {
    padding: Spacing.xl,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  resultEmoji: {
    fontSize: 64,
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
});
