import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Text,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import type {
  AvatarEffectPresentation,
  FramePresentation,
} from '@/constants/Cosmetics';

interface PortraitPreviewProps {
  uri: string;
  /**
   * Width of the frame in px. For `fullBody` the height is derived from a
   * 2:3 aspect ratio (size * 1.5).
   */
  size?: number;
  loading?: boolean;
  caption?: string;
  accessibilityLabel?: string;
  /**
   * `circle` — legacy avatar crop (battle strips, small contexts). Tall
   * sources are top-aligned so the face survives the crop.
   * `fullBody` — 2:3 frame with `contain` scaling: the full render (head to
   * feet, signature item) is always visible regardless of source aspect
   * (square from some providers, 2:3 vertical from others).
   */
  variant?: 'circle' | 'fullBody';
  /**
   * Frame colour. Defaults to brand purple.
   *
   * Per the design language, the frame around a character belongs to that
   * character: pass their signature colour so a blue fighter is not presented
   * in the game's purple.
   */
  accentColor?: string;
  /**
   * Equipped frame cosmetic. Overrides `accentColor` for the border, because a
   * frame is a deliberate purchase and the signature colour is a default.
   */
  frame?: FramePresentation | null;
  /** Equipped avatar effect. Only drawn on the `circle` variant. */
  avatarEffect?: AvatarEffectPresentation | null;
}

const FRAME_BORDER = 3;
const FRAME_PADDING = 4;
/** Full-body renders target a 2:3 (width:height) portrait aspect. */
const FULL_BODY_ASPECT = 1.5;

export default function PortraitPreview({
  uri,
  size = 240,
  loading = false,
  caption,
  accessibilityLabel = 'Character portrait',
  variant = 'circle',
  accentColor,
  frame,
  avatarEffect,
}: PortraitPreviewProps) {
  const colors = useThemedColors();
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!loading) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [loading, pulse]);

  // A frame is bought; the signature colour is the default. So the frame wins.
  // Gradients degrade to their first stop rather than being dropped — a
  // two-tone frame still reads as that frame's colour, and the alternative is
  // silently showing no purchase at all.
  const borderColor = frame?.colors[0] ?? accentColor ?? colors.primary;
  const borderWidth = frame?.width ?? FRAME_BORDER;
  const glow = variant === 'circle' ? (avatarEffect?.glow ?? 0) : (frame?.glow ?? 0);
  const glowColor = variant === 'circle'
    ? (avatarEffect?.color ?? borderColor)
    : borderColor;

  const isFullBody = variant === 'fullBody';
  const frameWidth = size;
  const frameHeight = isFullBody ? Math.round(size * FULL_BODY_ASPECT) : size;
  const frameRadius = isFullBody ? BorderRadius.lg : size / 2;
  const innerWidth = frameWidth - FRAME_PADDING * 2;
  const innerHeight = frameHeight - FRAME_PADDING * 2;
  const innerRadius = isFullBody
    ? Math.max(BorderRadius.lg - FRAME_PADDING, 0)
    : innerWidth / 2;

  return (
    <View style={styles.wrapper}>
      {/* The glow lives on a wrapper, not on the frame itself: the frame sets
          `overflow: hidden` to clip the image to its radius, and on iOS that
          also masks the layer's shadow, so a glow applied there renders as
          nothing. */}
      <View
        style={
          glow > 0
            ? {
                borderRadius: frameRadius,
                shadowColor: glowColor,
                shadowOpacity: 0.9,
                shadowRadius: glow,
                shadowOffset: { width: 0, height: 0 },
                elevation: Math.round(glow / 2),
              }
            : undefined
        }
      >
      <Animated.View
        style={[
          styles.frame,
          {
            width: frameWidth,
            height: frameHeight,
            borderRadius: frameRadius,
            borderColor,
            borderWidth,
            opacity: pulse,
          },
        ]}
      >
        {isFullBody ? (
          // Full-body: never crop. `contain` letterboxes non-2:3 sources
          // against a neutral fill instead of cutting off head or feet.
          <View
            style={{
              width: innerWidth,
              height: innerHeight,
              borderRadius: innerRadius,
              overflow: 'hidden',
              backgroundColor: colors.backgroundSecondary,
            }}
          >
            <Image
              source={{ uri }}
              style={{ width: innerWidth, height: innerHeight }}
              resizeMode="contain"
              accessibilityLabel={accessibilityLabel}
            />
          </View>
        ) : (
          // Circle avatar: full-body sources are tall — anchor the crop to
          // the top of the image so the face stays in frame.
          <View
            style={{
              width: innerWidth,
              height: innerHeight,
              borderRadius: innerRadius,
              overflow: 'hidden',
            }}
          >
            <Image
              source={{ uri }}
              style={{
                position: 'absolute',
                top: 0,
                width: innerWidth,
                height: Math.round(innerWidth * FULL_BODY_ASPECT),
              }}
              resizeMode="cover"
              accessibilityLabel={accessibilityLabel}
            />
          </View>
        )}
        {loading ? (
          <View style={[styles.spinnerOverlay, { borderRadius: frameRadius }]}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : null}
      </Animated.View>
      </View>
      {caption ? (
        <Text
          style={[styles.caption, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: FRAME_BORDER,
    overflow: 'hidden',
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  caption: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  // AI-content disclosure (concept §22): portraits are generated assets, so
  // the label rides on the image itself and survives screenshots.
});
