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
  accessibilityLabel?: string;
  accessibilityHint?: string;
  icon?: React.ComponentProps<typeof GameSymbol>['name'];
  gameIcon?: GameIconName;
  /** Shows a small accent dot on the segment (e.g. unsaved/staged changes). */
  badge?: boolean;
}

export interface SegmentedCategoryBarProps {
  items: SegmentedCategoryItem[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  itemRole?: 'tab' | 'button' | 'radio';
  /** Short icon/label choices fit across a small phone; large text still stacks. */
  compact?: boolean;
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
  disabled = false,
  itemRole = 'tab',
  compact = false,
}: SegmentedCategoryBarProps) {
  const colors = useThemedColors();
  const textStyle = useAccessibleTextStyle();
  const { width, fontScale } = useWindowDimensions();
  const largeText = width < (compact ? 320 : 390) || fontScale > 1.15;

  return (
    <GamePanel
      tone="ornate"
      accessibilityRole={
        itemRole === 'tab'
          ? 'tablist'
          : itemRole === 'radio'
            ? 'radiogroup'
            : undefined
      }
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
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              if (!selected) hapticSelection();
              onChange(item.key);
            }}
            accessibilityRole={itemRole}
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            accessibilityState={{
              selected,
              disabled,
              ...(itemRole === 'radio' ? { checked: selected } : {}),
            }}
            accessibilityHint={
              item.accessibilityHint ??
              (item.badge ? 'Contains unsaved changes' : undefined)
            }
            style={[
              styles.segment,
              largeText && styles.stackedSegment,
              disabled && styles.disabledSegment,
            ]}
          >
            <GameBevel
              color={selected ? colors.primary : 'transparent'}
              fill={selected ? colors.primary : 'transparent'}
              cut={6}
            />
            {item.gameIcon ? (
              <View style={styles.icon} pointerEvents="none">
                <GameIcon
                  name={item.gameIcon}
                  size={compact ? 18 : 22}
                  color={
                    selected ? inkFor(colors.primary) : colors.textSecondary
                  }
                />
              </View>
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
                compact && styles.compactLabel,
                textStyle,
                { color: selected ? inkFor(colors.primary) : colors.text },
              ]}
            >
              {item.label}
            </GameText>
            {compact && selected ? (
              <View
                pointerEvents="none"
                accessible={false}
                style={[
                  styles.selectionMarker,
                  { backgroundColor: inkFor(colors.primary) },
                ]}
              />
            ) : null}
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
  disabledSegment: { opacity: 0.5 },
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
  compactLabel: { fontSize: 18 },
  selectionMarker: {
    position: 'absolute',
    bottom: 3,
    width: 20,
    height: 2,
    borderRadius: 1,
  },
});
