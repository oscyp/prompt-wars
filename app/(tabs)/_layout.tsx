import { useBattleAttention } from '@/hooks/useBattleAttention';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useCallback, useMemo, useState, useRef } from 'react';
import { View } from 'react-native';
import { GameIcon, type GameIconName } from '@/components/game/icons/GameIcon';
import ArenaTabBar from '@/components/ArenaTabBar';
import BattleModeSheet, {
  BattleSheetProvider,
} from '@/components/BattleModeSheet';

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
function makeTabIcon(name: GameIconName) {
  const Icon = ({ color, size }: TabIconProps) => (
    <GameIcon name={name} size={Math.max(size, 28)} color={color} />
  );
  Icon.displayName = `TabBarIcon(${name})`;
  return Icon;
}
const ArenaIcon = makeTabIcon('arena');
const BattlesIcon = makeTabIcon('battle');
const RankingsIcon = makeTabIcon('rankings');
const ProfileIcon = makeTabIcon('profile');

export default function TabLayout() {
  const battleActionRef = useRef<View>(null);
  const battleBadge = useBattleAttention();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetApi = useMemo(() => ({ open: () => setSheetOpen(true) }), []);
  const renderTabBar = useCallback(
    (props: BottomTabBarProps) => (
      <ArenaTabBar
        {...props}
        battleActionRef={battleActionRef}
        onBattle={sheetApi.open}
      />
    ),
    [sheetApi],
  );

  return (
    <BattleSheetProvider value={sheetApi}>
      <Tabs tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="home"
          options={{ title: 'Arena', tabBarIcon: ArenaIcon }}
        />
        <Tabs.Screen
          name="battles"
          options={{
            title: 'Battles',
            tabBarIcon: BattlesIcon,
            tabBarBadge: battleBadge,
          }}
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
        returnFocusRef={battleActionRef}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </BattleSheetProvider>
  );
}
