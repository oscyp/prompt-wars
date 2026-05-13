import React, { useCallback } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Motion } from '@/constants/DesignTokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type HapticStrength = 'none' | 'selection' | 'light' | 'medium' | 'heavy';

interface HapticPressableProps extends PressableProps {
  haptic?: HapticStrength;
  scale?: number;
  pressableStyle?: StyleProp<ViewStyle>;
}

/**
 * Pressable with scale-on-press + optional haptic feedback.
 * Respects reduce-motion: if reduce-motion is on, skips the scale animation.
 */
export default function HapticPressable({
  onPressIn,
  onPressOut,
  onPress,
  haptic = 'selection',
  scale = Motion.pressScale,
  pressableStyle,
  style,
  children,
  disabled,
  ...rest
}: HapticPressableProps) {
  const pressed = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      if (mounted) setReduceMotion(rm);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressed.value }],
  }));

  const triggerHaptic = useCallback(() => {
    if (haptic === 'none' || disabled) return;
    switch (haptic) {
      case 'selection':
        Haptics.selectionAsync().catch(() => {});
        break;
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        break;
    }
  }, [haptic, disabled]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduceMotion && !disabled) {
          pressed.value = withTiming(scale, { duration: 80 });
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) {
          pressed.value = withTiming(1, { duration: 120 });
        }
        onPressOut?.(e);
      }}
      onPress={(e) => {
        triggerHaptic();
        onPress?.(e);
      }}
      style={[animatedStyle, pressableStyle, style as ViewStyle]}
    >
      {children as React.ReactNode}
    </AnimatedPressable>
  );
}
