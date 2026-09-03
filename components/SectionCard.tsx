import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  /** Optional trailing element rendered next to the title (badge, button). */
  trailing?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Visual grouping container used by the tab screens and the character flows.
 * Surfaces a rounded card on the secondary background with an optional
 * header row: a title (announced as a heading), a one-to-two line subtitle,
 * and a trailing slot for a count, badge or small action.
 */
export default function SectionCard({
  title,
  subtitle,
  trailing,
  children,
  style,
}: SectionCardProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.borderLight,
        },
        style,
      ]}
    >
      {title || subtitle || trailing ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? (
              <Text
                style={[styles.title, { color: colors.text }]}
                accessibilityRole="header"
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                style={[
                  styles.subtitle,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  headerText: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  trailing: {
    alignSelf: 'center',
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
});
