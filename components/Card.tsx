import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Shadows,
  Spacing,
} from '@/constants/DesignTokens';
import type { ArchetypeId } from '@/constants/Archetypes';
import { ARCHETYPES } from '@/constants/Archetypes';

export type CardVariant = 'solid' | 'glass' | 'neon' | 'gradient';

interface CardProps {
  variant?: CardVariant;
  archetypeId?: ArchetypeId;
  glow?: boolean;
  padding?: keyof typeof Spacing | 'none';
  borderRadius?: keyof typeof BorderRadius;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Custom 2- or 3-stop gradient (overrides variant). */
  gradient?: readonly [string, string] | readonly [string, string, string];
}

/**
 * The visual container for all surfaces.
 *
 * - `solid`: flat themed surface card.
 * - `glass`: subtle translucent overlay with thin border.
 * - `neon`: solid card with a gradient border ring.
 * - `gradient`: full gradient surface (give `gradient` or `archetypeId`).
 */
export default function Card({
  variant = 'solid',
  archetypeId,
  glow = false,
  padding = 'lg',
  borderRadius = 'xl',
  style,
  contentStyle,
  children,
  gradient,
}: CardProps) {
  const colors = useThemedColors();

  const archetype = archetypeId ? ARCHETYPES[archetypeId] : null;
  const resolvedGradient =
    gradient ??
    (archetype?.gradient ?? Gradients.cardSurface);

  const radius = BorderRadius[borderRadius];
  const innerPadding =
    padding === 'none' ? 0 : Spacing[padding];

  const glowShadow = glow
    ? archetype
      ? {
          shadowColor: archetype.glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 18,
          elevation: 8,
        }
      : Shadows.glowPrimary
    : undefined;

  if (variant === 'gradient') {
    return (
      <View style={[{ borderRadius: radius }, glowShadow, style]}>
        <LinearGradient
          colors={resolvedGradient as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.base,
            {
              borderRadius: radius,
              padding: innerPadding,
              borderWidth: 1,
              borderColor: colors.glassBorderStrong,
            },
            contentStyle,
          ]}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  if (variant === 'neon') {
    return (
      <View
        style={[
          { borderRadius: radius, padding: 1.5 },
          glowShadow ?? Shadows.glowSubtle,
          style,
        ]}
      >
        <LinearGradient
          colors={resolvedGradient as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius, padding: 1.5 }}
        >
          <View
            style={[
              styles.base,
              {
                backgroundColor: colors.card,
                borderRadius: radius - 1,
                padding: innerPadding,
              },
              contentStyle,
            ]}
          >
            {children}
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (variant === 'glass') {
    return (
      <View style={[{ borderRadius: radius }, glowShadow, style]}>
        <LinearGradient
          colors={Gradients.cardGlass as unknown as readonly [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.base,
            {
              backgroundColor: colors.surface2,
              borderRadius: radius,
              padding: innerPadding,
              borderWidth: 1,
              borderColor: colors.glassBorder,
            },
            contentStyle,
          ]}
        >
          {children}
        </LinearGradient>
      </View>
    );
  }

  // solid
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.card,
          borderRadius: radius,
          padding: innerPadding,
          borderWidth: 1,
          borderColor: colors.borderLight,
        },
        Shadows.cardSubtle,
        glowShadow,
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
