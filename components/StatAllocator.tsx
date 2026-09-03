import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
} from '@/constants/DesignTokens';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';
import type { StatBlock } from '@/types/battle';
import {
  BALANCED_STATS,
  STAT_KEYS,
  STAT_MAX,
  STAT_META,
  adjustStat,
  canDecrement,
  canIncrement,
  presetFor,
  remainingLabel,
  sameAllocation,
  type StatKey,
} from '@/utils/statAllocation';
import { hapticSelection } from '@/utils/haptics';
import StatBar from './StatBar';

export interface StatAllocatorProps {
  value: StatBlock;
  onChange: (next: StatBlock) => void;
  /** Offers this archetype's preset next to Balanced. */
  archetype?: ArchetypeId | null;
  accentColor: string;
  disabled?: boolean;
}

const BUTTON_SIZE = 44;

/**
 * Four stat rows with a shared points pool.
 *
 * Controlled: every change goes through `onChange` with the next block, and
 * the rules (floor, cap, pool) live in `utils/statAllocation.ts` so a screen
 * reader's increment action and the +/− buttons cannot disagree.
 */
export default function StatAllocator({
  value,
  onChange,
  archetype,
  accentColor,
  disabled = false,
}: StatAllocatorProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const change = (next: StatBlock) => {
    if (next === value) return;
    hapticSelection();
    onChange(next);
  };

  const preset = archetype ? presetFor(archetype) : null;
  const presetName = archetype ? `${ARCHETYPES[archetype].name} preset` : null;

  return (
    <View>
      <Text
        style={[
          styles.remaining,
          accessibleText,
          NumericFontVariant,
          { color: colors.text },
        ]}
        accessibilityLiveRegion="polite"
      >
        {remainingLabel(value)}
      </Text>

      <View style={styles.presets}>
        <PresetButton
          label="Balanced"
          selected={sameAllocation(value, BALANCED_STATS)}
          disabled={disabled}
          onPress={() => change({ ...BALANCED_STATS })}
        />
        {preset && presetName ? (
          <PresetButton
            label={presetName}
            selected={sameAllocation(value, preset)}
            disabled={disabled}
            onPress={() => change(preset)}
          />
        ) : null}
      </View>

      {STAT_KEYS.map((key) => (
        <StatRow
          key={key}
          statKey={key}
          value={value[key]}
          canUp={!disabled && canIncrement(value, key)}
          canDown={!disabled && canDecrement(value, key)}
          accentColor={accentColor}
          onUp={() => change(adjustStat(value, key, 1))}
          onDown={() => change(adjustStat(value, key, -1))}
        />
      ))}
    </View>
  );
}

function PresetButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={[
        styles.preset,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.backgroundTertiary : colors.card,
        },
      ]}
    >
      <Text style={[styles.presetText, accessibleText, { color: colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatRow({
  statKey,
  value,
  canUp,
  canDown,
  accentColor,
  onUp,
  onDown,
}: {
  statKey: StatKey;
  value: number;
  canUp: boolean;
  canDown: boolean;
  accentColor: string;
  onUp: () => void;
  onDown: () => void;
}) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const meta = STAT_META[statKey];

  return (
    <View
      style={[styles.row, { backgroundColor: colors.card }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${meta.label}, ${value} out of ${STAT_MAX}`}
      accessibilityHint={meta.effect}
      accessibilityValue={{ min: 1, max: STAT_MAX, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment' && canUp) onUp();
        if (event.nativeEvent.actionName === 'decrement' && canDown) onDown();
      }}
    >
      <View style={styles.rowText}>
        <StatBar label={meta.label} value={value} color={accentColor} />
        <Text
          style={[
            styles.effect,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {meta.effect}
        </Text>
      </View>
      <View style={styles.controls}>
        <StepButton
          icon="remove"
          label={`Decrease ${meta.label}`}
          enabled={canDown}
          onPress={onDown}
        />
        <StepButton
          icon="add"
          label={`Increase ${meta.label}`}
          enabled={canUp}
          onPress={onUp}
        />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: 'add' | 'remove';
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemedColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      // Buttons inside an `accessible` row are not reachable individually by a
      // screen reader; the row's adjustable actions cover that. They still
      // carry a label so testing and switch-control users can name them.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.stepButton,
        {
          borderColor: enabled ? colors.primary : colors.border,
          backgroundColor:
            pressed && enabled ? colors.backgroundTertiary : colors.background,
          opacity: enabled ? 1 : 0.45,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={enabled ? colors.primary : colors.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  remaining: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  preset: {
    minHeight: BUTTON_SIZE,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  rowText: { flex: 1, gap: Spacing.xs },
  effect: {
    fontSize: Typography.sizes.xs,
    lineHeight: 16,
  },
  controls: { flexDirection: 'row', gap: Spacing.sm },
  stepButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
