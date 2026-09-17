import { GameButton } from '@/components/game';
import { GameText } from '@/components/game';

import { View, StyleSheet } from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography } from '@/constants/DesignTokens';
import {
  describeCooldownLength,
  formatCooldown,
  type EditPricing,
} from '@/utils/editCooldowns';
import { archetypeOptions } from '@/utils/traitOptions';
import type { ArchetypeId } from '@/constants/Archetypes';
import OptionGrid from '../OptionGrid';
import BottomSheet from '../sheets/BottomSheet';
import { editStyles as s } from './styles';

export interface ArchetypeSheetProps {
  visible: boolean;
  /** The staged archetype. */
  value: ArchetypeId;
  /** The saved archetype, to say when the choice is still unsaved. */
  savedValue: ArchetypeId;
  pricing: EditPricing;
  /** Battle lock; the cooldown is read from `pricing` itself. */
  disabled?: boolean;
  /** Stages the pick; the Save bar commits it like every other change. */
  onStage: (archetype: ArchetypeId) => void;
  onClose: () => void;
}

/**
 * Choosing the class, from the chip beside the character.
 *
 * Staging only: a tap here changes the chip and the Save bar appears behind the
 * sheet, exactly as a tap on the Fighter tab's card would. The lock is stated
 * before the change, and while the cooldown runs the cards stop taking taps and
 * the countdown says when they start again.
 */
export default function ArchetypeSheet({
  visible,
  value,
  savedValue,
  pricing,
  disabled = false,
  onStage,
  onClose,
}: ArchetypeSheetProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();

  const cooldownMs = pricing.cooldownMs.archetype ?? 0;
  const cooling = cooldownMs > 0;
  const locksFor = describeCooldownLength(
    pricing.prices.archetype?.cooldownSeconds ?? 0,
  );
  const inert = disabled || cooling;
  const unsaved = value !== savedValue;

  const statusLine = cooling
    ? `Available in ${formatCooldown(cooldownMs)}`
    : disabled
      ? 'Unavailable while this fighter is in a battle.'
      : locksFor
        ? `A change locks it for ${locksFor}.`
        : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeAccessibilityLabel="Close archetype"
      title="Archetype"
      subtitle="A free identity preset for your fighter and portrait. No scoring bonus."
      footer={
        <GameButton
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={[
            s.primaryBtn,
            styles.done,
            { backgroundColor: colors.primary },
          ]}
          tone="primary"
          label="Done"
        />
      }
    >
      <View style={inert ? s.cooledDown : undefined}>
        <OptionGrid
          label="Archetype"
          options={archetypeOptions()}
          value={value}
          onChange={(v) => onStage(v as ArchetypeId)}
          disabled={inert}
          disabledReason={statusLine ?? undefined}
        />
      </View>

      {statusLine ? (
        <View style={styles.statusRow}>
          <GameSymbol
            name={cooling || disabled ? 'lock-closed-outline' : 'time-outline'}
            size={14}
            color={cooling || disabled ? colors.warning : colors.textTertiary}
          />
          <GameText
            variant="caption"
            style={[
              s.hint,
              accessibleText,
              {
                color:
                  cooling || disabled ? colors.warning : colors.textTertiary,
              },
            ]}
          >
            {statusLine}
          </GameText>
        </View>
      ) : null}

      {unsaved ? (
        <GameText
          variant="caption"
          style={[
            s.hint,
            accessibleText,
            styles.unsaved,
            { color: colors.primary },
          ]}
        >
          Unsaved · applied when you save.
        </GameText>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    minHeight: 18,
  },
  unsaved: {
    marginTop: Spacing.xs,
    fontWeight: Typography.weights.semibold,
  },
  done: {
    marginTop: Spacing.lg,
  },
});
