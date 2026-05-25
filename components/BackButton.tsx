import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ViewStyle,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Typography, BorderRadius, Spacing } from '@/constants/DesignTokens';

interface BackButtonProps {
  /** Override default `router.back()` behavior (e.g. multi-step screens). */
  onPress?: () => void;
  /** Hide automatically when there's no history (router.canGoBack === false). */
  hideWhenRoot?: boolean;
  /** When true, do not anchor with absolute positioning — caller controls layout. */
  inline?: boolean;
  /** Optional label rendered after the chevron. */
  label?: string;
  /** Additional style passed through to the touchable. */
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * Floating back button rendered in the top-left of any screen.
 *
 * Designed to overlay existing screen bodies without requiring layout changes
 * (all screens in this app render their own headers). Use `inline` to render
 * inside a normal flow instead.
 */
export default function BackButton({
  onPress,
  hideWhenRoot = true,
  inline = false,
  label,
  style,
  accessibilityLabel = 'Go back',
}: BackButtonProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemedColors();

  if (hideWhenRoot && !onPress && !router.canGoBack()) {
    return null;
  }

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  };

  const containerStyle: ViewStyle = inline
    ? {}
    : {
        position: 'absolute',
        top: insets.top + Spacing.sm,
        left: Spacing.md,
        zIndex: 50,
      };

  return (
    <View style={containerStyle} pointerEvents="box-none">
      <TouchableOpacity
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[
          styles.button,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
          label ? styles.withLabel : null,
          style,
        ]}
      >
        <Text style={[styles.chevron, { color: colors.text }]}>‹</Text>
        {label ? (
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  withLabel: {
    width: undefined,
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  chevron: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.semibold,
    lineHeight: Typography.sizes.xxl,
    marginTop: -4,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium,
  },
});
