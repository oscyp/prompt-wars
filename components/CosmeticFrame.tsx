import React, { useId } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageProps,
  type ImageSourcePropType,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { BorderRadius } from '@/constants/DesignTokens';
import type { FramePresentation } from '@/constants/Cosmetics';
import { useThemedColors } from '@/hooks/useThemedColors';

export interface CosmeticFrameProps {
  source: ImageSourcePropType;
  frame?: FramePresentation | null;
  variant?: 'circle' | 'fullBody';
  size: number;
  accentColor?: string;
  onImageError?: ImageProps['onError'];
  accessibilityLabel?: string;
}

/** Shared portrait aperture and decorative border. Artwork never masks the fighter. */
export default function CosmeticFrame({
  source,
  frame,
  variant = 'circle',
  size,
  accentColor,
  onImageError,
  accessibilityLabel,
}: CosmeticFrameProps) {
  const colors = useThemedColors();
  const gradientId = `frame-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const fullBody = variant === 'fullBody';
  const artwork = fullBody ? frame?.artwork?.portrait : frame?.artwork?.avatar;
  const height = artwork
    ? size / artwork.aspectRatio
    : fullBody
      ? Math.round(size * 1.5)
      : size;
  const radius = fullBody ? BorderRadius.lg : size / 2;
  const borderWidth = frame?.width ?? 3;
  const borderColor = frame?.colors[0] ?? accentColor ?? colors.primary;
  const gradient = !artwork && (frame?.colors.length ?? 0) > 1;
  const inset = artwork?.insets;
  const left = inset ? inset.left * size : 4;
  const top = inset ? inset.top * height : 4;
  const width = inset ? size * (1 - inset.left - inset.right) : size - 8;
  const imageHeight = inset
    ? height * (1 - inset.top - inset.bottom)
    : height - 8;

  return (
    <View testID="cosmetic-frame" style={{ width: size, height }}>
      <View
        testID="frame-aperture"
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height: imageHeight,
          borderRadius: fullBody
            ? Math.max(radius - 4, 0)
            : Math.min(width, imageHeight) / 2,
          overflow: 'hidden',
          backgroundColor: colors.backgroundSecondary,
        }}
      >
        <Image
          source={source}
          onError={onImageError}
          accessibilityLabel={accessibilityLabel}
          accessible={!!accessibilityLabel}
          importantForAccessibility={accessibilityLabel ? 'auto' : 'no'}
          resizeMode={fullBody || artwork ? 'contain' : 'cover'}
          style={{
            position: 'absolute',
            top: 0,
            width,
            height: imageHeight,
          }}
        />
      </View>
      {artwork ? (
        <View
          testID="frame-artwork-overlay"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Image
            testID="frame-artwork"
            source={artwork.source}
            resizeMode="contain"
            style={[StyleSheet.absoluteFill, { width: size, height }]}
            accessible={false}
          />
        </View>
      ) : gradient ? (
        <Svg
          testID="frame-gradient"
          width={size}
          height={height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              {frame!.colors.map((color, index) => (
                <Stop
                  key={`${index}-${color}`}
                  offset={`${(index / (frame!.colors.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            x={borderWidth / 2}
            y={borderWidth / 2}
            width={size - borderWidth}
            height={height - borderWidth}
            rx={Math.max(0, radius - borderWidth / 2)}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={borderWidth}
          />
        </Svg>
      ) : (
        <View
          testID="frame-solid"
          pointerEvents="none"
          accessible={false}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius, borderColor, borderWidth },
          ]}
        />
      )}
    </View>
  );
}
