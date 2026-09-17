import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import { GameText as Text } from './game';
import React, { useEffect, useRef } from 'react';
import {
  View,
  type ImageProps,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import CosmeticFrame from './CosmeticFrame';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import type {
  AvatarEffectPresentation,
  FramePresentation,
} from '@/constants/Cosmetics';

interface PortraitPreviewProps {
  uri: string;
  onImageError?: ImageProps['onError'];
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

/** Full-body renders target a 2:3 (width:height) portrait aspect. */
const FULL_BODY_ASPECT = 1.5;

export default function PortraitPreview({
  uri,
  onImageError,
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
  const active = useBattlePresentationActive();
  const reduceMotion = useReducedMotion() || !active;
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    // Reduce Motion keeps the frame steady; the spinner overlay below still
    // says a render is in flight.
    if (!loading || reduceMotion) {
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
  }, [loading, pulse, reduceMotion]);

  const borderColor = frame?.colors[0] ?? accentColor ?? colors.primary;
  const glow =
    variant === 'circle' ? (avatarEffect?.glow ?? 0) : (frame?.glow ?? 0);
  const glowColor =
    variant === 'circle' ? (avatarEffect?.color ?? borderColor) : borderColor;

  const isFullBody = variant === 'fullBody';
  const frameWidth = size;
  const frameHeight = isFullBody ? Math.round(size * FULL_BODY_ASPECT) : size;
  const frameRadius = isFullBody ? BorderRadius.lg : size / 2;

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
          style={{ width: frameWidth, height: frameHeight, opacity: pulse }}
        >
          <CosmeticFrame
            source={{ uri }}
            size={size}
            variant={variant}
            frame={frame}
            accentColor={accentColor}
            onImageError={onImageError}
            accessibilityLabel={accessibilityLabel}
          />
          {loading ? (
            <View
              style={[styles.spinnerOverlay, { borderRadius: frameRadius }]}
            >
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : null}
        </Animated.View>
      </View>
      {caption ? (
        <Text style={[styles.caption, { color: colors.textSecondary }]}>
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
