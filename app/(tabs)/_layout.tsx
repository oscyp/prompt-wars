import { Tabs } from 'expo-router';
import React from 'react';
import { useThemedColors } from '@/hooks/useThemedColors';

export default function TabLayout() {
  const colors = useThemedColors();

  return (
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
          title: 'Home',
          tabBarAccessibilityLabel: 'Home tab',
        }}
      />
      <Tabs.Screen
        name="battles"
        options={{
          title: 'Battles',
          tabBarAccessibilityLabel: 'Battles tab',
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarAccessibilityLabel: 'Create battle tab',
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: 'Rankings',
          tabBarAccessibilityLabel: 'Rankings tab',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
        }}
      />
    </Tabs>
  );
}
