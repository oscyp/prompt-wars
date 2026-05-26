import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { VideoJobUpdate } from '@/hooks/useRealtimeBattle';

export interface Tier0Payload {
  summary?: string;
  winnerColor?: string;
  battleCryText?: string;
  [key: string]: unknown;
}

export interface RoundResultCinematicProps {
  tier0Payload?: Tier0Payload | null;
  videoJob?: VideoJobUpdate | null;
  /**
   * Whether the Tier 1 video has passed moderation. Until true, UGC video
   * is rendered blurred.
   */
  isModerationApproved?: boolean;
}

/**
 * Shows Tier 0 (text) reveal immediately. If a Tier 1 video is ready AND
 * moderation has approved it, swaps to a video badge (the actual video player
 * lives on the final result screen). Pending UGC video is blurred.
 */
export default function RoundResultCinematic({
  tier0Payload,
  videoJob,
  isModerationApproved = false,
}: RoundResultCinematicProps) {
  const colors = useThemedColors();

  const tier1Ready =
    !!videoJob &&
    videoJob.status === 'succeeded' &&
    !!videoJob.video_url &&
    isModerationApproved;

  const tier1Pending =
    !!videoJob &&
    (videoJob.status === 'processing' ||
      videoJob.status === 'queued' ||
      videoJob.status === 'pending');

  const tier1Blurred =
    !!videoJob &&
    videoJob.status === 'succeeded' &&
    !isModerationApproved;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Round reveal"
    >
      <View
        style={[
          styles.poster,
          {
            backgroundColor:
              (tier0Payload?.winnerColor as string | undefined) ?? colors.primary,
          },
        ]}
      >
        {tier1Ready ? (
          <Text style={styles.posterBadge}>▶ TIER 1 VIDEO READY</Text>
        ) : tier1Pending ? (
          <View style={styles.posterCenter}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={styles.posterBadge}>Generating cinematic…</Text>
          </View>
        ) : tier1Blurred ? (
          <Text style={styles.posterBadge}>Video pending moderation</Text>
        ) : (
          <Text style={styles.posterBadge}>TIER 0 REVEAL</Text>
        )}
      </View>

      {tier0Payload?.battleCryText ? (
        <Text style={[styles.cry, { color: colors.text }]} numberOfLines={3}>
          “{tier0Payload.battleCryText}”
        </Text>
      ) : null}

      {tier0Payload?.summary ? (
        <Text
          style={[styles.summary, { color: colors.textSecondary }]}
        >
          {tier0Payload.summary}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  poster: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterCenter: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  posterBadge: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 4,
  },
  cry: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  summary: {
    fontSize: Typography.sizes.base,
    padding: Spacing.md,
  },
});
