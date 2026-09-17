import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type TextLayoutEvent,
} from 'react-native';
import {
  BottomTabBar,
  type BottomTabBarButtonProps,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import BrandMark from '@/components/game/BrandMark';
import { GameBevel, GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  RAISED_BATTLE_BUTTON_OVERHANG,
  RAISED_BATTLE_BUTTON_SIZE,
} from '@/hooks/useTabClearance';
import { hapticSelection } from '@/utils/haptics';

type ArenaTabBarProps = BottomTabBarProps & {
  onBattle: () => void;
  battleActionRef: React.RefObject<View | null>;
};

/** React Navigation still owns presses, long presses, links and selected state. */
function DestinationButton({
  children,
  style,
  ...props
}: BottomTabBarButtonProps) {
  const colors = useThemedColors();
  const [focused, setFocused] = useState(false);
  const selected = Boolean(
    props['aria-selected'] ?? props.accessibilityState?.selected,
  );
  return (
    <PlatformPressable
      {...props}
      pressOpacity={0.78}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={[style, styles.destination]}
    >
      {focused && (
        <GameBevel
          color={colors.focusRing}
          fill="transparent"
          strokeWidth={2}
          cut={6}
        />
      )}
      {selected && (
        <View
          testID="tab-selected-underline"
          pointerEvents="none"
          accessible={false}
          style={[
            styles.selectedUnderline,
            { backgroundColor: colors.ornament },
          ]}
        />
      )}
      {children}
    </PlatformPressable>
  );
}

const destinationButton = (props: BottomTabBarButtonProps) => (
  <DestinationButton {...props} />
);

/** Four destinations flank the raised Battle action without changing route state. */
export default function ArenaTabBar({
  onBattle,
  battleActionRef,
  descriptors,
  ...props
}: ArenaTabBarProps) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const [battleFocused, setBattleFocused] = useState(false);
  const battleSlotWidth = RAISED_BATTLE_BUTTON_SIZE + 16;
  const layoutKey = `${width}:${fontScale}`;
  const [labels, setLabels] = useState<{
    key: string;
    heights: Record<string, number>;
  }>({ key: layoutKey, heights: {} });
  const heights = labels.key === layoutKey ? labels.heights : {};
  const recordLabel = (key: string, event: TextLayoutEvent) => {
    const height = Math.ceil(
      Math.max(
        0,
        ...event.nativeEvent.lines.map((line) => line.y + line.height),
      ),
    );
    if (!height) return;
    setLabels((previous) => {
      const current = previous.key === layoutKey ? previous.heights : {};
      return current[key] === height
        ? previous
        : { key: layoutKey, heights: { ...current, [key]: height } };
    });
  };
  const badgeHeight = Math.max(20, Math.ceil(14 * fontScale) + 4);
  const iconHeight = Math.max(28, badgeHeight);
  const destinationLabelHeight = Math.max(
    20,
    ...props.state.routes.map((route) => heights[route.key] ?? 0),
  );
  const barHeight =
    Math.max(
      78,
      iconHeight + destinationLabelHeight + 18,
      RAISED_BATTLE_BUTTON_SIZE -
        RAISED_BATTLE_BUTTON_OVERHANG +
        12 +
        (heights.battle ?? 20),
    ) + props.insets.bottom;
  const decorated = Object.fromEntries(
    props.state.routes.map((route) => {
      const descriptor = descriptors[route.key];
      const badge = descriptor.options.tabBarBadge;
      return [
        route.key,
        {
          ...descriptor,
          options: {
            ...descriptor.options,
            tabBarActiveTintColor: colors.ornament,
            tabBarInactiveTintColor: colors.textSecondary,
            tabBarAllowFontScaling: true,
            tabBarLabelPosition: 'below-icon' as const,
            tabBarButton: destinationButton,
            tabBarLabel: ({
              color,
              children,
            }: {
              color: string;
              children: string;
            }) => (
              <GameText
                variant="label"
                onTextLayout={(event) => recordLabel(route.key, event)}
                style={[styles.label, { color }]}
              >
                {children}
              </GameText>
            ),
            tabBarAccessibilityLabel:
              descriptor.options.tabBarAccessibilityLabel ??
              (badge
                ? `${descriptor.options.title ?? route.name}, ${badge} battles requiring attention`
                : (descriptor.options.title ?? route.name)),
            tabBarBadgeStyle: {
              backgroundColor: colors.error,
              color: colors.dangerInk,
              borderColor: colors.card,
              borderWidth: 2,
              height: badgeHeight,
              minWidth: badgeHeight,
              fontSize: 11,
              lineHeight: 14,
              paddingHorizontal: 4,
            },
            tabBarIconStyle: { height: iconHeight },
            tabBarItemStyle: [
              descriptor.options.tabBarItemStyle,
              { minWidth: 48 },
              route.name === 'rankings' && { marginStart: battleSlotWidth },
            ],
            tabBarStyle: [
              descriptor.options.tabBarStyle,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.ornamentMuted,
                borderTopWidth: 1,
                height: barHeight,
                paddingTop: 6,
              },
            ],
          },
        },
      ];
    }),
  );

  return (
    <View
      testID="arena-tab-bar"
      style={[
        styles.bar,
        { minHeight: barHeight + RAISED_BATTLE_BUTTON_OVERHANG },
      ]}
    >
      <BottomTabBar {...props} descriptors={decorated} />
      <Pressable
        ref={battleActionRef}
        accessibilityRole="button"
        accessibilityLabel="Start a battle"
        accessibilityHint="Opens the battle mode picker"
        onFocus={() => setBattleFocused(true)}
        onBlur={() => setBattleFocused(false)}
        onPress={() => {
          hapticSelection();
          onBattle();
        }}
        style={({ pressed }) => [
          styles.battleAction,
          {
            width: battleSlotWidth,
            marginLeft: -battleSlotWidth / 2,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.battleCircle,
            {
              backgroundColor: colors.selectedSurface,
              borderColor: battleFocused ? colors.focusRing : colors.ornament,
              borderWidth: battleFocused ? 2 : 1,
            },
          ]}
        >
          <BrandMark kind="emblem" size={RAISED_BATTLE_BUTTON_SIZE} />
        </View>
        <GameText
          variant="label"
          onTextLayout={(event) => recordLabel('battle', event)}
          style={[styles.battleLabel, { color: colors.ornament }]}
        >
          Battle
        </GameText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingTop: RAISED_BATTLE_BUTTON_OVERHANG,
    marginTop: -RAISED_BATTLE_BUTTON_OVERHANG,
  },
  selectedUnderline: {
    position: 'absolute',
    bottom: 0,
    width: '68%',
    maxWidth: 44,
    height: 3,
    borderRadius: 2,
    alignSelf: 'center',
  },
  destination: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 0,
    marginHorizontal: 2,
    paddingHorizontal: 2,
    justifyContent: 'flex-start',
    gap: 2,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.2,
    textAlign: 'center',
    width: '100%',
  },
  battleAction: {
    position: 'absolute',
    top: 0,
    left: '50%',
    alignItems: 'center',
    gap: 4,
    minHeight: 48,
  },
  battleCircle: {
    width: RAISED_BATTLE_BUTTON_SIZE,
    height: RAISED_BATTLE_BUTTON_SIZE,
    borderRadius: RAISED_BATTLE_BUTTON_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  battleLabel: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center',
    width: '100%',
  },
});
