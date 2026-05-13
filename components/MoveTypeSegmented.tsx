import React, { useEffect } from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Motion,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import HapticPressable from './HapticPressable';

export type MoveType = 'attack' | 'defense' | 'finisher';

interface MoveTypeSegmentedProps {
  value: MoveType;
  onChange: (v: MoveType) => void;
  style?: StyleProp<ViewStyle>;
}

const OPTIONS: { id: MoveType; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { id: 'attack', label: 'Attack', icon: 'sword' },
  { id: 'defense', label: 'Defense', icon: 'shield' },
  { id: 'finisher', label: 'Finisher', icon: 'star-four-points' },
];

const GRADIENT_BY: Record<MoveType, readonly [string, string]> = {
  attack: Gradients.heroAttack,
  defense: Gradients.heroDefense,
  finisher: Gradients.heroFinisher,
};

const GLOW_BY: Record<MoveType, keyof typeof Shadows> = {
  attack: 'glowAttack',
  defense: 'glowDefense',
  finisher: 'glowFinisher',
};

export default function MoveTypeSegmented({
  value,
  onChange,
  style,
}: MoveTypeSegmentedProps) {
  const colors = useThemedColors();
  const [width, setWidth] = React.useState(0);
  const segmentW = width / OPTIONS.length;
  const selectedIndex = OPTIONS.findIndex((o) => o.id === value);
  const x = useSharedValue(selectedIndex * segmentW);

  useEffect(() => {
    x.value = withSpring(selectedIndex * segmentW, Motion.springs.snappy);
  }, [selectedIndex, segmentW, x]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: segmentW,
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.glassBorder,
        },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {width > 0 && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { padding: Spacing.xs },
            indicatorStyle,
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={GRADIENT_BY[value] as unknown as readonly [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.indicator,
              Shadows[GLOW_BY[value]],
            ]}
          />
        </Animated.View>
      )}
      {OPTIONS.map((opt) => {
        const active = opt.id === value;
        return (
          <HapticPressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            haptic="selection"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            style={styles.segment}
          >
            <MaterialCommunityIcons
              name={opt.icon}
              size={18}
              color={active ? '#FFFFFF' : colors.textSecondary}
              style={{ marginRight: Spacing.xs }}
            />
            <Text
              style={{
                color: active ? '#FFFFFF' : colors.textSecondary,
                fontFamily: Typography.fonts.bodyBold,
                fontSize: Typography.sizes.sm,
                letterSpacing: Typography.letterSpacing.wide,
                textTransform: 'uppercase',
              }}
            >
              {opt.label}
            </Text>
          </HapticPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    padding: Spacing.xs,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  indicator: {
    flex: 1,
    borderRadius: BorderRadius.pill,
  },
});
