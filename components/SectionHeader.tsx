import React from 'react';
import { StyleSheet, Text, View, StyleProp, ViewStyle } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import HapticPressable from './HapticPressable';

interface SectionHeaderProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
  align?: 'left' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

export default function SectionHeader({
  title,
  eyebrow,
  subtitle,
  actionLabel,
  onActionPress,
  style,
  align = 'left',
  size = 'md',
}: SectionHeaderProps) {
  const colors = useThemedColors();

  const titleSize =
    size === 'hero'
      ? Typography.sizes.display1
      : size === 'lg'
        ? Typography.sizes.display3
        : size === 'sm'
          ? Typography.sizes.lg
          : Typography.sizes.xxl;

  return (
    <View style={[styles.row, style]}>
      <View style={[styles.textBlock, align === 'center' && styles.center]}>
        {eyebrow && (
          <Text
            style={{
              color: colors.accent,
              fontFamily: Typography.fonts.bodyBold,
              fontSize: Typography.sizes.xs,
              letterSpacing: Typography.letterSpacing.widest,
              marginBottom: Spacing.xs,
              textTransform: 'uppercase',
              textAlign: align,
            }}
            accessibilityRole="text"
          >
            {eyebrow}
          </Text>
        )}
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontFamily:
              size === 'hero'
                ? Typography.fonts.displayBlack
                : Typography.fonts.display,
            fontSize: titleSize,
            letterSpacing: Typography.letterSpacing.wide,
            textAlign: align,
          }}
        >
          {title}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: Typography.fonts.body,
              fontSize: Typography.sizes.base,
              marginTop: Spacing.xs,
              textAlign: align,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
      {actionLabel && onActionPress && (
        <HapticPressable
          onPress={onActionPress}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.action}
        >
          <Text
            style={{
              color: colors.accent,
              fontFamily: Typography.fonts.bodySemibold,
              fontSize: Typography.sizes.sm,
            }}
          >
            {actionLabel}
          </Text>
        </HapticPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  textBlock: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  action: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});
