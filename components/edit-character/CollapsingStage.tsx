import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Spacing } from '@/constants/DesignTokens';
import { isCollapsed, stageFrame, type StageMetrics } from './stageMath';

export interface CollapsingStageProps {
  /** The outer scroll's offset, from `useAnimatedScrollHandler`. */
  scrollY: SharedValue<number>;
  /** Navigation header height, from `useHeaderHeight()` on the screen. */
  headerHeight: number;
  expanded: React.ReactNode;
  compact: React.ReactNode;
  /** Pinned to the Stage's bottom edge, so it is sticky without `stickyHeaderIndices`. */
  tabBar: React.ReactNode;
  backgroundColor: string;
  /** Measured heights, once every slot has laid out and whenever they change. */
  onMetrics: (m: StageMetrics) => void;
  /** Used until the first measurement lands (see `estimateMetrics`). */
  initialMetrics: StageMetrics;
}

/**
 * The absolutely positioned header of the edit-character screen.
 *
 * Its height interpolates from `expandedHeight` to `compactHeight` as the
 * outer scroll moves; the two slots cross-fade on opacity only, because height
 * is the one layout property we animate and the slots are measured by
 * `onLayout`. The hidden slot loses touches and drops out of the accessibility
 * tree, so a screen reader never lands on a control at 0% opacity.
 *
 * This is the only Reanimated component on the screen; everything inside the
 * slots is plain React Native.
 */
export default function CollapsingStage({
  scrollY,
  headerHeight,
  expanded,
  compact,
  tabBar,
  backgroundColor,
  onMetrics,
  initialMetrics,
}: CollapsingStageProps) {
  const reduceMotion = useReducedMotion();
  const [expandedH, setExpandedH] = useState(0);
  const [compactH, setCompactH] = useState(0);
  const [tabBarH, setTabBarH] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const measured = expandedH > 0 && compactH > 0 && tabBarH > 0;
  const metrics = useMemo<StageMetrics>(
    () =>
      measured
        ? {
            expandedHeight: expandedH + tabBarH,
            compactHeight: compactH + tabBarH,
          }
        : initialMetrics,
    [measured, expandedH, compactH, tabBarH, initialMetrics],
  );

  const lastEmitted = useRef<StageMetrics | null>(null);
  useEffect(() => {
    if (!measured) return;
    const prev = lastEmitted.current;
    if (
      prev &&
      prev.expandedHeight === metrics.expandedHeight &&
      prev.compactHeight === metrics.compactHeight
    ) {
      return;
    }
    lastEmitted.current = metrics;
    onMetrics(metrics);
  }, [measured, metrics, onMetrics]);

  const onExpandedLayout = useCallback((e: LayoutChangeEvent) => {
    setExpandedH(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onCompactLayout = useCallback((e: LayoutChangeEvent) => {
    setCompactH(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onTabBarLayout = useCallback((e: LayoutChangeEvent) => {
    setTabBarH(Math.round(e.nativeEvent.layout.height));
  }, []);

  const containerStyle = useAnimatedStyle(
    () => ({ height: stageFrame(scrollY.value, metrics, reduceMotion).height }),
    [metrics, reduceMotion],
  );
  const expandedStyle = useAnimatedStyle(
    () => ({
      opacity: stageFrame(scrollY.value, metrics, reduceMotion).expandedOpacity,
    }),
    [metrics, reduceMotion],
  );
  const compactStyle = useAnimatedStyle(
    () => ({
      opacity: stageFrame(scrollY.value, metrics, reduceMotion).compactOpacity,
    }),
    [metrics, reduceMotion],
  );

  useAnimatedReaction(
    () => isCollapsed(scrollY.value, metrics, reduceMotion),
    (next, prev) => {
      if (next !== prev) runOnJS(setCollapsed)(next);
    },
    [metrics, reduceMotion],
  );

  return (
    <Animated.View
      style={[styles.container, { backgroundColor }, containerStyle]}
      testID="collapsing-stage"
    >
      <Animated.View
        style={[styles.slot, expandedStyle]}
        pointerEvents={collapsed ? 'none' : 'auto'}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
      >
        <View
          onLayout={onExpandedLayout}
          style={{ paddingTop: headerHeight }}
          testID="collapsing-stage-expanded"
        >
          {expanded}
        </View>
      </Animated.View>
      <Animated.View
        style={[styles.slot, compactStyle]}
        pointerEvents={collapsed ? 'auto' : 'none'}
        accessibilityElementsHidden={!collapsed}
        importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
      >
        <View
          onLayout={onCompactLayout}
          style={{ paddingTop: headerHeight }}
          testID="collapsing-stage-compact"
        >
          {compact}
        </View>
      </Animated.View>
      <View
        onLayout={onTabBarLayout}
        style={[styles.tabBar, { backgroundColor }]}
        testID="collapsing-stage-tab-bar"
      >
        {tabBar}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
});
