import { GameText as Text } from '@/components/game';
import CosmeticFrame from '@/components/CosmeticFrame';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Scrim,
} from '@/constants/DesignTokens';
import { VideoJobUpdate } from '@/hooks/useRealtimeBattle';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';

/**
 * Legacy voice-line metadata carried by older reveal payloads. The silent
 * client ignores it; fields remain optional for backward-compatible parsing.
 */
export interface RevealBattleCryVoice {
  voice_preset?: string;
  text?: string;
  asset_url?: string | null;
  duration_ms?: number;
}

/**
 * Client-facing subset of the server `reveal_spec` (RevealPayloadV1). Legacy
 * audio fields remain typed only for backward-compatible payload parsing.
 */
export interface RevealSpec {
  composition_type?: 'motion_poster' | 'static_scorecard';
  animation_preset?: string;
  winner_color?: string;
  music_track_id?: string;
  music_track_url?: string | null;
  move_sting_id?: string;
  move_sting_url?: string | null;
  battle_cry_voice?: RevealBattleCryVoice;
}

/** Minimal per-player fields the poster needs to pick an archetype illustration. */
export interface RevealPlayerLite {
  profile_id?: string | null;
  archetype?: string | null;
  /** Fighter name, so screens can say who fought instead of "You"/"Opponent". */
  character_name?: string | null;
}

export interface Tier0Payload {
  summary?: string;
  winnerColor?: string;
  battleCryText?: string;
  /** Optional portrait produced for the reveal; used as the poster subject. */
  portraitUrl?: string;
  winnerPortraitUrl?: string;
  /** Nested reveal spec (audio ids + winner voice line). Optional/defensive. */
  reveal_spec?: RevealSpec | null;
  /**
   * Nested players block (subset). Used to resolve the winner's archetype so the
   * poster can show a bundled archetype illustration instead of a bare color
   * field. Optional/defensive.
   */
  players?: {
    player_one?: RevealPlayerLite;
    player_two?: RevealPlayerLite;
  } | null;
  /** Nested outcome block (subset). Carries the winner profile id. */
  outcome?: {
    winner_profile_id?: string | null;
  } | null;
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
  /**
   * Real photo portrait to feature in the procedural poster. Falls back to the
   * payload's portrait, then to the winner's bundled archetype illustration.
   * Never blocks the reveal.
   */
  portraitUrl?: string | null;
  /**
   * Winner's archetype, used to pick a bundled illustration when no real photo
   * is available. When omitted, it's resolved from `tier0Payload` (players +
   * outcome.winner_profile_id). Never blocks the reveal.
   */
  archetype?: string | null;
  /**
   * Which reveal this poster is. Only the accessibility label changes: the
   * series result says "Battle reveal", a round says "Round reveal".
   */
  context?: 'round' | 'battle';
  cosmetics?: EquippedCosmetics;
}

/**
 * Resolve the winner's archetype from the reveal payload so the poster can show
 * a bundled archetype illustration when no real photo exists. Falls back to
 * player one (then two) for draws / unknown winners; null when unavailable.
 */
function resolveWinnerArchetype(payload?: Tier0Payload | null): string | null {
  const players = payload?.players;
  if (!players) return null;
  const winnerId = payload?.outcome?.winner_profile_id ?? null;
  if (winnerId) {
    if (players.player_one?.profile_id === winnerId) {
      return players.player_one?.archetype ?? null;
    }
    if (players.player_two?.profile_id === winnerId) {
      return players.player_two?.archetype ?? null;
    }
  }
  return players.player_one?.archetype ?? players.player_two?.archetype ?? null;
}

/**
 * Shows the Tier 0 (text) reveal immediately on a cinematic, vertical (9:16)
 * poster: a signature-color gradient (winner's color) with a subtly parallaxed
 * subject — the real character photo when one is available, otherwise the
 * winner's bundled archetype illustration (never a bare color field).
 *
 * If a Tier 1 video is ready AND moderation has approved it, a video badge is
 * shown (the actual player lives on the final result screen). Pending UGC video
 * stays badged/blurred until moderation approves. This procedural base is
 * deterministic and must render before any AI art exists.
 */
export default function RoundResultCinematic({
  tier0Payload,
  videoJob,
  isModerationApproved = false,
  portraitUrl,
  archetype,
  context = 'round',
  cosmetics,
}: RoundResultCinematicProps) {
  const colors = useThemedColors();
  const active = useBattlePresentationActive();
  const reduceMotion = useReducedMotion() || !active;
  const [posterWidth, setPosterWidth] = useState(260);
  const [portraitFailed, setPortraitFailed] = useState(false);

  // Ken Burns / parallax drift for the portrait. One-time, subtle, and static
  // when Reduce Motion is on.
  const scale = useSharedValue(reduceMotion ? 1 : 0.96);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      translateY.value = 0;
      return;
    }
    scale.value = withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    return () => {
      cancelAnimation(scale);
      cancelAnimation(translateY);
    };
  }, [reduceMotion, scale, translateY]);

  const portraitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const tier1Ready =
    !!videoJob && videoJob.status === 'succeeded' && isModerationApproved;

  // The DB enum `video_job_status` is queued / submitted / processing /
  // succeeded / failed. There is no 'pending'; a job sitting in 'submitted'
  // used to fall through every branch and show no badge at all.
  const tier1Pending =
    !!videoJob &&
    (videoJob.status === 'queued' ||
      videoJob.status === 'submitted' ||
      videoJob.status === 'processing');

  const tier1Blurred =
    !!videoJob && videoJob.status === 'succeeded' && !isModerationApproved;

  const portrait =
    portraitUrl ??
    tier0Payload?.portraitUrl ??
    tier0Payload?.winnerPortraitUrl ??
    null;
  const showPortrait = !!portrait && !portraitFailed;
  useEffect(() => setPortraitFailed(false), [portrait]);

  // Designed fallback subject when no real photo exists: the winner's bundled
  // archetype illustration (always resolves to a local image, never null).
  const effectiveArchetype = archetype ?? resolveWinnerArchetype(tier0Payload);
  const archetypeAvatar = getArchetypeAvatar(effectiveArchetype);

  const subject = context === 'battle' ? 'Battle reveal' : 'Round reveal';
  const posterA11y = tier1Ready
    ? `${subject}, cinematic ready`
    : tier1Pending
      ? `${subject}, generating cinematic`
      : tier1Blurred
        ? `${subject}, video pending moderation`
        : subject;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.card,
          borderColor: colors.ornamentMuted,
        },
      ]}
    >
      <View
        style={styles.poster}
        onLayout={(event) =>
          setPosterWidth(
            Math.max(48, Math.min(320, event.nativeEvent.layout.width - 24)),
          )
        }
        accessible
        accessibilityRole="image"
        accessibilityLabel={posterA11y}
      >
        <Animated.View style={portraitStyle}>
          <CosmeticFrame
            size={posterWidth}
            variant="fullBody"
            source={
              showPortrait ? { uri: portrait as string } : archetypeAvatar
            }
            frame={cosmetics?.frame}
            accentColor={colors.ornament}
            onImageError={() => setPortraitFailed(true)}
          />
        </Animated.View>

        {/* Status overlays. Each sits on a dark pill to guarantee AA contrast
            regardless of the winner's signature color (e.g. white-on-orange). */}
        <View style={styles.posterContent} pointerEvents="none">
          {tier1Ready ? (
            <View style={styles.badgePill}>
              <GameSymbol name="play" size={16} color="#FFFFFF" />
              <Text style={styles.posterBadge}>Cinematic ready</Text>
            </View>
          ) : tier1Pending ? (
            <View style={styles.badgePill}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.posterBadge}>Generating cinematic…</Text>
            </View>
          ) : tier1Blurred ? (
            <View style={styles.badgePill}>
              <GameSymbol name="shield-half" size={16} color="#FFFFFF" />
              <Text style={styles.posterBadge}>Video pending moderation</Text>
            </View>
          ) : null}
        </View>
      </View>

      {tier0Payload?.battleCryText ? (
        <Text style={[styles.cry, { color: colors.text }]}>
          “{tier0Payload.battleCryText}”
        </Text>
      ) : null}

      {tier0Payload?.summary ? (
        <Text style={[styles.summary, { color: colors.textSecondary }]}>
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
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterContent: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Scrim.pill,
  },
  posterBadge: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.3,
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
