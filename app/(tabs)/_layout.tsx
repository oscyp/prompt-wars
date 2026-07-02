import { Tabs } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Circle,
} from 'react-native-svg';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Elevation, Gradients } from '@/constants/DesignTokens';
import BattleModeSheet, {
  BattleSheetProvider,
} from '@/components/BattleModeSheet';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: IoniconName, unfocused: IoniconName) {
  const Icon = ({
    color,
    size,
    focused: isFocused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
  Icon.displayName = 'TabBarIcon';
  return Icon;
}

const BATTLE_BUTTON_SIZE = 60;

/**
 * Raised center "Battle" action (the game's verb, not a place). Breaks the
 * tab bar line as a brand-gradient circle and opens the mode bottom-sheet
 * instead of navigating; the `create` route stays reachable for deep links.
 */
function RaisedBattleButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.battleSlot} pointerEvents="box-none">
      {/* Shadow lives on the wrapper: iOS drops shadows on overflow-hidden views. */}
      <View style={[styles.battleShadow, Elevation.lg]}>
        <Pressable
          style={styles.battleButton}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Start battle"
        >
        <Svg
          width={BATTLE_BUTTON_SIZE}
          height={BATTLE_BUTTON_SIZE}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <SvgLinearGradient id="battleGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={Gradients.brand[0]} />
              <Stop offset="100%" stopColor={Gradients.brand[1]} />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={BATTLE_BUTTON_SIZE / 2}
            cy={BATTLE_BUTTON_SIZE / 2}
            r={BATTLE_BUTTON_SIZE / 2}
            fill="url(#battleGrad)"
          />
        </Svg>
          <MaterialCommunityIcons
            name="sword-cross"
            size={28}
            color="#FFFFFF"
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colors = useThemedColors();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetApi = useMemo(
    () => ({ open: () => setSheetOpen(true) }),
    [],
  );

  return (
    <BattleSheetProvider value={sheetApi}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.tabIconSelected,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Arena',
            tabBarAccessibilityLabel: 'Arena tab',
            tabBarIcon: tabIcon('flame', 'flame-outline'),
          }}
        />
        <Tabs.Screen
          name="battles"
          options={{
            title: 'Battles',
            tabBarAccessibilityLabel: 'Battles tab',
            tabBarIcon: tabIcon('game-controller', 'game-controller-outline'),
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            title: 'Battle',
            tabBarAccessibilityLabel: 'Start battle',
            tabBarButton: () => (
              <RaisedBattleButton onPress={() => setSheetOpen(true)} />
            ),
          }}
        />
        <Tabs.Screen
          name="rankings"
          options={{
            title: 'Rankings',
            tabBarAccessibilityLabel: 'Rankings tab',
            tabBarIcon: tabIcon('trophy', 'trophy-outline'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarAccessibilityLabel: 'Profile tab',
            tabBarIcon: tabIcon('person', 'person-outline'),
          }}
        />
      </Tabs>
      <BattleModeSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </BattleSheetProvider>
  );
}

const styles = StyleSheet.create({
  battleSlot: {
    flex: 1,
    alignItems: 'center',
  },
  battleShadow: {
    borderRadius: BATTLE_BUTTON_SIZE / 2,
    marginTop: -(BATTLE_BUTTON_SIZE / 2) + 6,
  },
  battleButton: {
    width: BATTLE_BUTTON_SIZE,
    height: BATTLE_BUTTON_SIZE,
    borderRadius: BATTLE_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
