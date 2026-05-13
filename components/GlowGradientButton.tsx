import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Layout,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import HapticPressable, { HapticStrength } from './HapticPressable';

type Variant =
  | 'primary'
  | 'attack'
  | 'defense'
  | 'finisher'
  | 'gold'
  | 'ghost'
  | 'danger'
  | 'secondary';

type Size = 'sm' | 'md' | 'lg';

interface GlowGradientButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  iconLeft?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconRight?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  haptic?: HapticStrength;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

const VARIANT_GRADIENTS: Record<Variant, readonly [string, string] | readonly [string, string, string]> = {
  primary: Gradients.heroPrimary,
  attack: Gradients.heroAttack,
  defense: Gradients.heroDefense,
  finisher: Gradients.heroFinisher,
  gold: Gradients.rankGold,
  ghost: ['transparent', 'transparent'] as const,
  danger: ['#7F1D1D', '#DC2626'] as const,
  secondary: Gradients.cardSurface,
};

const VARIANT_GLOW: Record<Variant, keyof typeof Shadows> = {
  primary: 'glowPrimary',
  attack: 'glowAttack',
  defense: 'glowDefense',
  finisher: 'glowFinisher',
  gold: 'glowGold',
  ghost: 'none',
  danger: 'glowAttack',
  secondary: 'cardSubtle',
};

const SIZE_HEIGHT: Record<Size, number> = {
  sm: Layout.buttonHeightSm,
  md: Layout.buttonHeight,
  lg: Layout.buttonHeightLg,
};

const SIZE_FONT: Record<Size, number> = {
  sm: Typography.sizes.sm,
  md: Typography.sizes.base,
  lg: Typography.sizes.lg,
};

const SIZE_ICON: Record<Size, number> = {
  sm: 16,
  md: 20,
  lg: 24,
};

/**
 * Primary call-to-action button for Prompt Wars.
 * Gradient fill + outer glow + scale-on-press + haptic.
 *
 * Use `ghost` variant for secondary actions (transparent with bordered chrome).
 */
export default function GlowGradientButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  iconLeft,
  iconRight,
  haptic = 'medium',
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: GlowGradientButtonProps) {
  const colors = useThemedColors();
  const isGhost = variant === 'ghost';
  const isDisabled = disabled || loading;

  const stops = VARIANT_GRADIENTS[variant];
  const glow = isDisabled ? Shadows.none : Shadows[VARIANT_GLOW[variant]];
  const textColor = isGhost ? colors.text : '#FFFFFF';
  const height = SIZE_HEIGHT[size];

  return (
    <HapticPressable
      onPress={onPress}
      disabled={isDisabled}
      haptic={isDisabled ? 'none' : haptic}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      style={[
        styles.wrapper,
        { height, borderRadius: BorderRadius.xl },
        fullWidth && styles.fullWidth,
        !isDisabled && !isGhost && glow,
        style,
      ]}
    >
      <LinearGradient
        // expo-linear-gradient's TS types accept tuples; the readonly tuple is fine.
        colors={stops as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          { borderRadius: BorderRadius.xl },
          isGhost && { borderWidth: 1.5, borderColor: colors.glassBorderStrong, backgroundColor: 'transparent' },
          isDisabled && { opacity: 0.45 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <View style={styles.content}>
            {iconLeft && (
              <MaterialCommunityIcons
                name={iconLeft}
                size={SIZE_ICON[size]}
                color={textColor}
                style={styles.iconLeft}
              />
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.text,
                {
                  color: textColor,
                  fontSize: SIZE_FONT[size],
                  fontFamily: Typography.fonts.bodyBold,
                },
              ]}
            >
              {title}
            </Text>
            {iconRight && (
              <MaterialCommunityIcons
                name={iconRight}
                size={SIZE_ICON[size]}
                color={textColor}
                style={styles.iconRight}
              />
            )}
          </View>
        )}
      </LinearGradient>
    </HapticPressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'visible',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  gradient: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLeft: {
    marginRight: Spacing.sm,
  },
  iconRight: {
    marginLeft: Spacing.sm,
  },
  text: {
    fontWeight: Typography.weights.bold,
    letterSpacing: Typography.letterSpacing.wide,
    textAlign: 'center',
  },
});
