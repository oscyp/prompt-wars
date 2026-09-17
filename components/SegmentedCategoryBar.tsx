import { GamePanel, GameText, GameBevel } from '@/components/game';
import { inkFor } from '@/utils/contrast';
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { GameIcon, type GameIconName } from './game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { hapticSelection } from '@/utils/haptics';

export interface SegmentedCategoryItem {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof GameSymbol>['name'];
  gameIcon?: GameIconName;
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
  const { width, fontScale } = useWindowDimensions();
  const largeText = width < 390 || fontScale > 1.15;

  return (
    <GamePanel
      tone="ornate"
      accessibilityRole="tablist"
      style={[
        styles.bar,
        largeText && styles.stackedBar,
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
            accessibilityHint={
              item.badge ? 'Contains unsaved changes' : undefined
            }
            style={[styles.segment, largeText && styles.stackedSegment]}
          >
            <GameBevel
              color={selected ? colors.primary : 'transparent'}
              fill={selected ? colors.primary : 'transparent'}
              cut={6}
            />
            {item.gameIcon ? (
              <GameIcon
                name={item.gameIcon}
                size={22}
                color={selected ? inkFor(colors.primary) : colors.textSecondary}
              />
            ) : item.icon ? (
              <GameSymbol
                name={item.icon}
                size={16}
                color={selected ? inkFor(colors.primary) : colors.textSecondary}
                style={styles.icon}
                accessible={false}
              />
            ) : null}
            <GameText
              variant="label"
              style={[
                styles.label,
                textStyle,
                { color: selected ? inkFor(colors.primary) : colors.text },
              ]}
            >
              {item.label}
            </GameText>
            {item.badge ? (
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: selected
                      ? inkFor(colors.primary)
                      : colors.primary,
                  },
                ]}
              />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </GamePanel>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderRadius: 0,
    padding: Spacing.xs,
    gap: Spacing.xs,
  },
  stackedBar: { flexDirection: 'column', borderRadius: 0 },
  stackedSegment: { flex: 0, minHeight: 48, borderRadius: 0 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Each segment keeps a 48pt minimum target;
    // vertical padding alone left them at ~36pt.
    minHeight: 48,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: 0,
  },
  icon: {
    marginRight: Spacing.xs,
  },
  label: {
    flexShrink: 1,
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
