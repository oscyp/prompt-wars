import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  Motion,
} from '@/constants/DesignTokens';

export interface ToastProps {
  text: string;
}

/**
 * Transient confirmation shown after an edit lands.
 *
 * Lifted out of the edit-character screen, where it was the app's only toast
 * and had two problems worth not re-creating: the fade ignored
 * `useReducedMotion`, and nothing was ever announced, so a screen-reader user
 * spent a credit and got no feedback at all. `announceForAccessibility` is the
 * first live-region announcement in the app -- the live region alone is not
 * enough on iOS for a view that mounts already containing its text.
 *
 * Sits above the home indicator; callers do not pass insets.
 */
export default function Toast({ text }: ToastProps) {
  const colors = useThemedColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: Motion.durations.fast,
      useNativeDriver: true,
    }).start();
  }, [opacity, reduceMotion, text]);

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity,
          bottom: insets.bottom + Spacing.lg,
        },
      ]}
    >
      <Text style={[styles.text, accessibleText, { color: colors.text }]}>
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: Typography.sizes.sm,
  },
});
