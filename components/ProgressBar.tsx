import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import { BorderRadius, Gradients } from '@/constants/DesignTokens';

interface ProgressBarProps {
  /** 0..1 */
  progress: number;
  height?: number;
  gradient?: readonly [string, string] | readonly [string, string, string];
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const AnimatedLG = Animated.createAnimatedComponent(LinearGradient);

export default function ProgressBar({
  progress,
  height = 8,
  gradient = Gradients.heroPrimary,
  trackColor,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const colors = useThemedColors();
  const clamped = Math.max(0, Math.min(1, progress));
  const widthSV = useSharedValue(0);

  useEffect(() => {
    widthSV.value = withTiming(clamped, { duration: 700 });
  }, [clamped, widthSV]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${widthSV.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: trackColor ?? colors.surface3 },
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
    >
      <AnimatedLG
        colors={gradient as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fill, animatedStyle, { height }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: BorderRadius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    borderRadius: BorderRadius.pill,
  },
});
