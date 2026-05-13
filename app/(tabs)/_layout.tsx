import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Layout,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import HapticPressable from '@/components/HapticPressable';

const ROUTE_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    iconFocused: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  }
> = {
  home: { label: 'Home', icon: 'home-variant-outline', iconFocused: 'home-variant' },
  battles: { label: 'Battles', icon: 'sword-cross', iconFocused: 'sword-cross' },
  create: { label: 'Battle', icon: 'plus', iconFocused: 'plus' },
  rankings: { label: 'Ranks', icon: 'podium-gold', iconFocused: 'podium-gold' },
  profile: { label: 'You', icon: 'account-outline', iconFocused: 'account' },
};

function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBarShell,
        {
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
          left: Layout.tabBarFloatingMargin,
          right: Layout.tabBarFloatingMargin,
        },
      ]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={50}
        tint="dark"
        style={[
          styles.bar,
          {
            backgroundColor: colors.tabBarBackground,
            borderColor: colors.glassBorder,
          },
          Shadows.cardElevated,
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const meta = ROUTE_META[route.name] ?? {
            label: route.name,
            icon: 'circle-outline',
            iconFocused: 'circle',
          };
          const isFocused = state.index === index;
          const isCenter = route.name === 'create';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          if (isCenter) {
            return (
              <HapticPressable
                key={route.key}
                onPress={onPress}
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel={options.tabBarAccessibilityLabel ?? 'Start a battle'}
                accessibilityState={{ selected: isFocused }}
                style={styles.centerSlot}
              >
                <LinearGradient
                  colors={Gradients.heroPrimary as unknown as readonly [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.centerButton, Shadows.glowPrimary]}
                >
                  <MaterialCommunityIcons name="sword-cross" size={28} color="#FFFFFF" />
                </LinearGradient>
              </HapticPressable>
            );
          }

          return (
            <HapticPressable
              key={route.key}
              onPress={onPress}
              haptic="selection"
              accessibilityRole="button"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? `${meta.label} tab`}
              accessibilityState={{ selected: isFocused }}
              style={styles.tab}
            >
              <MaterialCommunityIcons
                name={isFocused ? meta.iconFocused : meta.icon}
                size={22}
                color={isFocused ? colors.tabIconSelected : colors.tabIconDefault}
              />
              <Text
                numberOfLines={1}
                style={{
                  color: isFocused ? colors.tabIconSelected : colors.tabIconDefault,
                  fontFamily: isFocused
                    ? Typography.fonts.bodyBold
                    : Typography.fonts.bodyMedium,
                  fontSize: Typography.sizes.xs,
                  marginTop: 2,
                  letterSpacing: Typography.letterSpacing.wide,
                }}
              >
                {meta.label}
              </Text>
              {isFocused && (
                <View
                  style={[
                    styles.activeDot,
                    {
                      backgroundColor: colors.accent,
                      shadowColor: colors.accent,
                    },
                  ]}
                />
              )}
            </HapticPressable>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarAccessibilityLabel: 'Home tab' }}
      />
      <Tabs.Screen
        name="battles"
        options={{ title: 'Battles', tabBarAccessibilityLabel: 'Battles tab' }}
      />
      <Tabs.Screen
        name="create"
        options={{ title: 'Battle', tabBarAccessibilityLabel: 'Start a battle' }}
      />
      <Tabs.Screen
        name="rankings"
        options={{ title: 'Ranks', tabBarAccessibilityLabel: 'Rankings tab' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'You', tabBarAccessibilityLabel: 'Profile tab' }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarShell: {
    position: 'absolute',
    bottom: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Layout.tabBarHeight,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    height: Layout.tabBarHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xs,
  },
  centerSlot: {
    width: 64,
    height: Layout.tabBarHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
});
