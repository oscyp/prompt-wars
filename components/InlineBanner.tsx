import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export type BannerTone = 'info' | 'warning' | 'error';

export interface InlineBannerProps {
  tone?: BannerTone;
  text: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Renders a trailing button when both this and `onAction` are supplied. */
  actionLabel?: string;
  onAction?: () => void;
}

const DEFAULT_ICON: Record<
  BannerTone,
  React.ComponentProps<typeof Ionicons>['name']
> = {
  info: 'information-circle-outline',
  warning: 'lock-closed-outline',
  error: 'alert-circle-outline',
};

/**
 * A persistent, non-dismissable explanation of why a surface is limited.
 *
 * Every blocked state in the edit flow used to arrive as an `Alert` AFTER the
 * player had already composed an edit and tapped a paid button -- the battle
 * lock especially, which is knowable on load. A banner states the constraint
 * before the interaction instead of punishing it afterwards.
 */
export default function InlineBanner({
  tone = 'info',
  text,
  icon,
  actionLabel,
  onAction,
}: InlineBannerProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const accent =
    tone === 'error'
      ? colors.error
      : tone === 'warning'
        ? colors.warning
        : colors.info;

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.wrap,
        { borderColor: accent, backgroundColor: colors.backgroundSecondary },
      ]}
    >
      <Ionicons name={icon ?? DEFAULT_ICON[tone]} size={16} color={accent} />
      <Text style={[styles.text, accessibleText, { color: colors.text }]}>
        {text}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: accent }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
  },
  action: {
    minHeight: 44,
    justifyContent: 'center',
  },
  actionText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
