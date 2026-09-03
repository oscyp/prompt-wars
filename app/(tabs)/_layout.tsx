import { Tabs } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Circle,
} from 'react-native-svg';
import { useThemedColors } from '@/hooks/useThemedColors';
import { RAISED_BATTLE_BUTTON_SIZE } from '@/hooks/useTabClearance';
import { Elevation, Gradients, Ink } from '@/constants/DesignTokens';
import { hapticSelection } from '@/utils/haptics';
import BattleModeSheet, {
  BattleSheetProvider,
} from '@/components/BattleModeSheet';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  color: string;
  size: number;
  focused: boolean;
}

/**
 * Builds a tab icon renderer once, at module scope. Defining these inside
 * `options` made a fresh component type on every layout render, which
 * remounted every icon each time the sheet opened or closed.
 */
function makeTabIcon(focused: IoniconName, unfocused: IoniconName) {
  const Icon = ({ color, size, focused: isFocused }: TabIconProps) => (
    <Ionicons
      name={isFocused ? focused : unfocused}
      size={size}
      color={color}
    />
  );
  Icon.displayName = `TabBarIcon(${focused})`;
  return Icon;
}

const ArenaIcon = makeTabIcon('flame', 'flame-outline');
const BattlesIcon = makeTabIcon('game-controller', 'game-controller-outline');
const RankingsIcon = makeTabIcon('trophy', 'trophy-outline');
const ProfileIcon = makeTabIcon('person', 'person-outline');

/**
 * Raised center "Battle" action (the game's verb, not a place). Breaks the
 * tab bar line as a brand-gradient circle and opens the mode bottom-sheet
 * instead of navigating; the `create` route stays reachable for deep links.
 */
function RaisedBattleButton({ onPress }: { onPress: () => void }) {
  const handlePress = () => {
    hapticSelection();
    onPress();
  };

  return (
    <View style={styles.battleSlot} pointerEvents="box-none">
      {/* Shadow lives on the wrapper: iOS drops shadows on overflow-hidden views. */}
      <View style={[styles.battleShadow, Elevation.lg]}>
        <Pressable
          style={({ pressed }) => [
            styles.battleButton,
            { transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Start a battle"
          accessibilityHint="Opens the battle mode picker"
        >
          <Svg
            width={RAISED_BATTLE_BUTTON_SIZE}
            height={RAISED_BATTLE_BUTTON_SIZE}
            style={StyleSheet.absoluteFill}
          >
            <Defs>
              <SvgLinearGradient id="battleGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={Gradients.brand[0]} />
                <Stop offset="100%" stopColor={Gradients.brand[1]} />
              </SvgLinearGradient>
            </Defs>
            <Circle
              cx={RAISED_BATTLE_BUTTON_SIZE / 2}
              cy={RAISED_BATTLE_BUTTON_SIZE / 2}
              r={RAISED_BATTLE_BUTTON_SIZE / 2}
              fill="url(#battleGrad)"
            />
          </Svg>
          <MaterialCommunityIcons
            name="sword-cross"
            size={28}
            color={Ink.onAccentLight}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colors = useThemedColors();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetApi = useMemo(() => ({ open: () => setSheetOpen(true) }), []);
  const renderBattleButton = useCallback(
    () => <RaisedBattleButton onPress={sheetApi.open} />,
    [sheetApi],
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
          options={{ title: 'Arena', tabBarIcon: ArenaIcon }}
        />
        <Tabs.Screen
          name="battles"
          options={{ title: 'Battles', tabBarIcon: BattlesIcon }}
        />
        {/* Icon-only slot: the Pressable inside carries the label and hint. */}
        <Tabs.Screen
          name="create"
          options={{ tabBarButton: renderBattleButton }}
        />
        <Tabs.Screen
          name="rankings"
          options={{ title: 'Rankings', tabBarIcon: RankingsIcon }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ProfileIcon }}
        />
      </Tabs>
      <BattleModeSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </BattleSheetProvider>
  );
}

const styles = StyleSheet.create({
  battleSlot: {
    flex: 1,
    alignItems: 'center',
  },
  battleShadow: {
    borderRadius: RAISED_BATTLE_BUTTON_SIZE / 2,
    marginTop: -(RAISED_BATTLE_BUTTON_SIZE / 2) + 6,
  },
  battleButton: {
    width: RAISED_BATTLE_BUTTON_SIZE,
    height: RAISED_BATTLE_BUTTON_SIZE,
    borderRadius: RAISED_BATTLE_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
