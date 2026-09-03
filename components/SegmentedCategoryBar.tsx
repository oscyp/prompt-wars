import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { hapticSelection } from '@/utils/haptics';

export interface SegmentedCategoryItem {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Shows a small accent dot on the segment (e.g. unsaved/staged changes). */
  badge?: boolean;
}

export interface SegmentedCategoryBarProps {
  items: SegmentedCategoryItem[];
  value: string;
  onChange: (key: string) => void;
}

/**
 * Compact tab / segmented control used to switch the contextual editor "dock"
 * on the edit-character screen. Equal-width segments; the active one is filled
 * with the primary color. Colors resolve through `useThemedColors` so it keeps
 * working in dark + high-contrast themes.
 */
export default function SegmentedCategoryBar({
  items,
  value,
  onChange,
}: SegmentedCategoryBarProps) {
  const colors = useThemedColors();
  const textStyle = useAccessibleTextStyle();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => {
              if (!selected) hapticSelection();
              onChange(item.key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.primary },
            ]}
          >
            {item.icon ? (
              <Ionicons
                name={item.icon}
                size={16}
                color={selected ? '#FFFFFF' : colors.textSecondary}
                style={styles.icon}
              />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                textStyle,
                { color: selected ? '#FFFFFF' : colors.text },
              ]}
            >
              {item.label}
            </Text>
            {item.badge ? (
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: selected ? '#FFFFFF' : colors.primary,
                  },
                ]}
              />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Four equal-width segments each need the 44pt minimum in their own right;
    // vertical padding alone left them at ~36pt.
    minHeight: 44,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  icon: {
    marginRight: Spacing.xs,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: Spacing.xs,
  },
});
