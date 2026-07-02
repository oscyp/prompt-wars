import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
} from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  Spacing,
  Typography,
  BorderRadius,
  Gradients,
} from '@/constants/DesignTokens';
import { VideoJobUpdate } from '@/hooks/useRealtimeBattle';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';

/**
 * Winner voice line carried by the reveal payload. `asset_url` is null until
 * server-side TTS enrichment runs; until then the client speaks `text` via
 * on-device `expo-speech`. All fields optional for defensive client parsing.
 */
export interface RevealBattleCryVoice {
  voice_preset?: string;
  text?: string;
  asset_url?: string | null;
  duration_ms?: number;
}

/**
 * Client-facing subset of the server `reveal_spec` (RevealPayloadV1). Only the
 * fields the audio layer needs are typed; ids line up 1:1 with the registry in
 * `constants/RevealAudio.ts`. All fields optional for defensive client parsing.
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
}: RoundResultCinematicProps) {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [portraitFailed, setPortraitFailed] = useState(false);

  // Ken Burns / parallax drift for the portrait. One-time, subtle, and static
  // when Reduce Motion is on.
  const scale = useSharedValue(reduceMotion ? 1 : 1.12);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      translateY.value = 0;
      return;
    }
    scale.value = withTiming(1, {
      duration: 3600,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(-6, {
      duration: 3600,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduceMotion, scale, translateY]);

  const portraitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

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

  const baseColor = tier0Payload?.winnerColor ?? colors.primary;
  const stops = Gradients.poster(baseColor);

  const portrait =
    portraitUrl ??
    tier0Payload?.portraitUrl ??
    tier0Payload?.winnerPortraitUrl ??
    null;
  const showPortrait = !!portrait && !portraitFailed;

  // Designed fallback subject when no real photo exists: the winner's bundled
  // archetype illustration (always resolves to a local image, never null).
  const effectiveArchetype = archetype ?? resolveWinnerArchetype(tier0Payload);
  const archetypeAvatar = getArchetypeAvatar(effectiveArchetype);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  const posterA11y = tier1Ready
    ? 'Round reveal, Tier 1 video ready'
    : tier1Pending
      ? 'Round reveal, generating cinematic'
      : tier1Blurred
        ? 'Round reveal, video pending moderation'
        : 'Round reveal';

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={styles.poster}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={posterA11y}
      >
        {/* Solid signature-color base (sits behind the poster subject). */}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: baseColor }]}
        />

        {/* Parallaxed poster subject: the real character photo when available,
            otherwise the winner's bundled archetype illustration (never an empty
            color field). Reduce Motion keeps it static via `portraitStyle`. */}
        {showPortrait ? (
          <Animated.Image
            source={{ uri: portrait as string }}
            style={[StyleSheet.absoluteFill, portraitStyle]}
            resizeMode="cover"
            onError={() => setPortraitFailed(true)}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : (
          <Animated.Image
            source={archetypeAvatar}
            style={[StyleSheet.absoluteFill, portraitStyle]}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}

        {/* Signature vertical gradient overlay (fades to near-black for AA). */}
        {size.width > 0 ? (
          <Svg
            width={size.width}
            height={size.height}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          >
            <Defs>
              <SvgLinearGradient id="posterGrad" x1="0" y1="0" x2="0" y2="1">
                {stops.map((s, i) => (
                  <Stop
                    key={i}
                    offset={s.offset}
                    stopColor={s.color}
                    stopOpacity={s.opacity}
                  />
                ))}
              </SvgLinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={size.width}
              height={size.height}
              fill="url(#posterGrad)"
            />
          </Svg>
        ) : null}

        {/* AI-content disclosure (store-readiness, concept §22). Always on the
            poster so screenshots and the share capture carry the label. */}
        <View style={styles.aiBadge} pointerEvents="none">
          <Ionicons name="sparkles" size={10} color="#FFFFFF" />
          <Text style={styles.aiBadgeText}>AI-GENERATED</Text>
        </View>

        {/* Status overlays. Each sits on a dark pill to guarantee AA contrast
            regardless of the winner's signature color (e.g. white-on-orange). */}
        <View style={styles.posterContent} pointerEvents="none">
          {tier1Ready ? (
            <View style={styles.badgePill}>
              <Ionicons name="play" size={16} color="#FFFFFF" />
              <Text style={styles.posterBadge}>TIER 1 VIDEO READY</Text>
            </View>
          ) : tier1Pending ? (
            <View style={styles.badgePill}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.posterBadge}>Generating cinematic…</Text>
            </View>
          ) : tier1Blurred ? (
            <View style={styles.badgePill}>
              <Ionicons name="shield-half" size={16} color="#FFFFFF" />
              <Text style={styles.posterBadge}>Video pending moderation</Text>
            </View>
          ) : null}
        </View>
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
    aspectRatio: 9 / 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterContent: {
    ...StyleSheet.absoluteFillObject,
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
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  aiBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  aiBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.8,
  },
  posterBadge: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
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
