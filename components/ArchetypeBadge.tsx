import React, { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { ARCHETYPES, ArchetypeId } from '@/constants/Archetypes';
import { BorderRadius, Shadows } from '@/constants/DesignTokens';

interface ArchetypeBadgeProps {
  archetypeId: ArchetypeId;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZE_MAP: Record<NonNullable<ArchetypeBadgeProps['size']>, number> = {
  sm: 40,
  md: 64,
  lg: 96,
  xl: 128,
};

/**
 * Circular sigil disc with a gradient fill, gradient ring, and a centered icon.
 * Optionally pulses (subtle scale loop) for hero contexts.
 */
export default function ArchetypeBadge({
  archetypeId,
  size = 'md',
  animated = false,
  style,
}: ArchetypeBadgeProps) {
  const arch = ARCHETYPES[archetypeId];
  const px = SIZE_MAP[size];
  const iconSize = Math.round(px * 0.5);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (animated) {
      pulse.value = withRepeat(
        withTiming(1.06, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    } else {
      pulse.value = 1;
    }
  }, [animated, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          width: px,
          height: px,
          borderRadius: BorderRadius.full,
          shadowColor: arch.glowColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.7,
          shadowRadius: px * 0.18,
          elevation: 12,
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${arch.name} sigil`}
    >
      <LinearGradient
        colors={arch.gradient as unknown as readonly [string, string]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: px,
          height: px,
          borderRadius: BorderRadius.full,
          padding: Math.max(2, px * 0.04),
          ...Shadows.cardElevated,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#0A0A12',
            borderRadius: BorderRadius.full,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: arch.color,
          }}
        >
          <MaterialCommunityIcons
            name={arch.iconName}
            size={iconSize}
            color={arch.color}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
