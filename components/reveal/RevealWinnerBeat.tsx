import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Ink,
  Scrim,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { hapticImpact } from '@/utils/haptics';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';
import {
  winnerBeatCopy,
  type RevealSide,
  type StingPreset,
} from '@/utils/revealBeats';
import {
  KEN_BURNS_MS,
  POSTER_CAPTION_RATIO,
  STING_DELAY_MS,
  imageSourceChain,
  type RevealInsets,
} from '@/utils/revealLayout';
import MoveSting from './MoveSting';

export interface RevealWinnerBeatProps {
  winner: RevealSide;
  isMe: boolean;
  isKo: boolean;
  /** The winner's colour: gradient base and chip accent. */
  color: string;
  /**
   * Fresh signed renders from `useBattleCharacters`. The payload's own signed
   * URL is the last resort because it may have expired.
   */
  fighterUrl: string | null;
  avatarUrl: string | null;
  sting: StingPreset | null;
  reduceMotion: boolean;
  insets: RevealInsets;
}

function isMoveType(v: string | null): v is MoveType {
  return v === 'attack' || v === 'defense' || v === 'finisher';
}

/**
 * Beat two: the poster. The winner's full-body render in its real colours,
 * drifting on a slow Ken Burns; the lower part of the frame becomes a caption
 * zone that fades from the signature colour into near-black, carrying the
 * kicker, the name, the battle cry and the move chip. The move sting plays
 * over the image and lands with an impact haptic.
 */
export default function RevealWinnerBeat({
  winner,
  isMe,
  isKo,
  color,
  fighterUrl,
  avatarUrl,
  sting,
  reduceMotion,
  insets,
}: RevealWinnerBeatProps) {
  const colors = useThemedColors();
  const copy = winnerBeatCopy({
    name: winner.name,
    isMe,
    isKo,
    battleCry: winner.battleCry,
  });

  const chain = useMemo(
    () => imageSourceChain([fighterUrl, avatarUrl, winner.portraitUrl]),
    [fighterUrl, avatarUrl, winner.portraitUrl],
  );
  const [failed, setFailed] = useState(0);
  const uri = chain[failed] ?? null;
  const source = uri ? { uri } : getArchetypeAvatar(winner.archetype);
  const stepDown = useCallback(() => setFailed((n) => n + 1), []);

  // Ken Burns, as on RoundResultCinematic: settle from 1.12 to 1 with a small
  // upward drift. Static under Reduce Motion.
  const scale = useSharedValue(reduceMotion ? 1 : 1.12);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);
  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      translateY.value = 0;
      return;
    }
    scale.value = withTiming(1, {
      duration: KEN_BURNS_MS,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(-6, {
      duration: KEN_BURNS_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduceMotion, scale, translateY]);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const move = isMoveType(winner.moveType) ? winner.moveType : null;

  return (
    <View style={styles.root}>
      <Animated.Image
        key={uri ?? 'archetype'}
        source={source}
        style={[StyleSheet.absoluteFill, imageStyle]}
        resizeMode="cover"
        onError={stepDown}
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="winner-poster-image"
      />

      {/* Caption zone: only the lower part of the frame is scrimmed, so the
          fighter keeps its real colours above. */}
      <View
        style={[
          styles.captionZone,
          { height: `${POSTER_CAPTION_RATIO * 100}%` },
        ]}
        pointerEvents="none"
      >
        <CaptionScrim base={color} />
      </View>

      <MoveSting
        preset={sting}
        color={color}
        delayMs={STING_DELAY_MS}
        onLanded={hapticImpact}
      />

      <View
        style={[styles.caption, { paddingBottom: insets.bottom }]}
        pointerEvents="none"
      >
        <Text style={styles.kicker}>{copy.kicker}</Text>
        <Text style={styles.name}>{copy.name}</Text>
        {copy.battleCry ? (
          <Text style={styles.cry} numberOfLines={3}>
            {copy.battleCry}
          </Text>
        ) : null}
        {move ? (
          <View style={styles.chip}>
            <Ionicons
              name={MOVE_META[move].icon}
              size={14}
              color={colors[move]}
            />
            <Text style={styles.chipText}>{moveLabel(move)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The caption zone's gradient. `PosterGradient` opens at 95% of the base
 * colour, which is right for a full poster but draws a hard edge across the
 * fighter when anchored to the bottom half; this fades in from transparent
 * and ends on the same near-black terminal stop the poster token uses, so
 * white caption text keeps AA where it sits.
 */
function CaptionScrim({ base }: { base: string }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = `captionScrim-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const poster = Gradients.poster(base);
  const terminal = poster[poster.length - 1];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) {
      setSize({ width, height });
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={base} stopOpacity={0} />
              <Stop offset="22%" stopColor={base} stopOpacity={0.6} />
              <Stop
                offset="55%"
                stopColor={terminal.color}
                stopOpacity={0.88}
              />
              <Stop
                offset="100%"
                stopColor={terminal.color}
                stopOpacity={terminal.opacity}
              />
            </SvgLinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={size.width}
            height={size.height}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  captionZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  caption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  kicker: {
    color: Ink.onAccentLight,
    opacity: 0.85,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  name: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.display,
    fontWeight: Typography.weights.bold,
    lineHeight: Typography.sizes.display * 1.1,
  },
  cry: {
    color: Ink.onAccentLight,
    opacity: 0.9,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    fontStyle: 'italic',
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Scrim.pill,
  },
  chipText: {
    color: Ink.onAccentLight,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
