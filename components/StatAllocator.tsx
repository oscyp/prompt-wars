import { GameButton } from '@/components/game';
import { GameText, GamePanel } from '@/components/game';

import { View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
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
  pointTotal?: number;
}

const BUTTON_SIZE = 48;

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
  pointTotal = 20,
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
      <GameText
        variant="body"
        style={[
          styles.remaining,
          accessibleText,
          NumericFontVariant,
          { color: colors.text },
        ]}
        accessibilityLiveRegion="polite"
      >
        {remainingLabel(value, pointTotal)}
      </GameText>

      {pointTotal === 20 && (
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
      )}

      {STAT_KEYS.map((key) => (
        <StatRow
          key={key}
          statKey={key}
          value={value[key]}
          canUp={!disabled && canIncrement(value, key, pointTotal)}
          canDown={!disabled && canDecrement(value, key)}
          accentColor={accentColor}
          onUp={() => change(adjustStat(value, key, 1, pointTotal))}
          onDown={() => change(adjustStat(value, key, -1, pointTotal))}
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
  return (
    <GameButton
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
      tone="secondary"
      label={label}
    />
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
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 390 || fontScale > 1.15;

  return (
    <GamePanel
      tone="ornate"
      style={[
        styles.row,
        { backgroundColor: colors.card },
        stacked && { flexDirection: 'column', alignItems: 'stretch' },
      ]}
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
        <GameText
          variant="body"
          style={[
            styles.effect,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          {meta.effect}
        </GameText>
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
    </GamePanel>
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
      <GameSymbol
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
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  rowText: { flex: 1, gap: Spacing.xs, minWidth: 0 },
  effect: {
    fontSize: Typography.sizes.sm,
    lineHeight: 21,
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'flex-end',
  },
  stepButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
