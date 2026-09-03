import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { ARCHETYPES, type ArchetypeId } from '@/constants/Archetypes';

export interface ArchetypeChipProps {
  /** The staged archetype, so the chip shows what the player is about to be. */
  archetype: ArchetypeId;
  /** `stage` sits on the dark poster; `compact` on the themed hero row. */
  variant: 'stage' | 'compact';
  /** Differs from the saved archetype; marks the chip like the tab badges. */
  staged?: boolean;
  /** The archetype cooldown is running; the sheet explains, the chip signals. */
  locked?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const WHITE = '#FFFFFF';

/** The class as label text: "The Strategist · rewards Defense moves". */
export function archetypeChipText(archetype: ArchetypeId): string {
  const a = ARCHETYPES[archetype];
  return a ? `${a.name} · rewards ${a.rewards}` : archetype;
}

/**
 * The character's class, beside the character.
 *
 * Archetype is the one choice on the edit screen that is both gameplay and
 * appearance, and it used to sit as a card among the battle cry and the name.
 * Games put the class next to the fighter; this does the same, in both Stage
 * states, and opens the archetype sheet on tap.
 */
export default function ArchetypeChip({
  archetype,
  variant,
  staged = false,
  locked = false,
  disabled = false,
  onPress,
}: ArchetypeChipProps) {
  const colors = useThemedColors();
  const accessibleText = useAccessibleTextStyle();
  const a = ARCHETYPES[archetype];
  const swatch = a?.color ?? colors.primary;
  const onStage = variant === 'stage';
  const textColor = onStage ? WHITE : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Archetype: ${archetypeChipText(archetype)}`}
      accessibilityHint={
        locked
          ? 'Locked for now. Opens the archetype details.'
          : 'Change archetype'
      }
      accessibilityState={{ disabled }}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.chip,
        onStage
          ? styles.chipStage
          : {
              backgroundColor: colors.backgroundTertiary,
              borderColor: colors.border,
            },
        { borderLeftColor: swatch },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: swatch }]} />
      <Text
        style={[styles.text, accessibleText, { color: textColor }]}
        numberOfLines={1}
      >
        {archetypeChipText(archetype)}
      </Text>
      {locked ? (
        <Ionicons
          name="lock-closed-outline"
          size={12}
          color={onStage ? 'rgba(255,255,255,0.72)' : colors.textSecondary}
        />
      ) : null}
      {staged ? (
        <View
          style={[
            styles.stagedDot,
            { backgroundColor: onStage ? WHITE : colors.primary },
          ]}
        />
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={12}
        color={onStage ? 'rgba(255,255,255,0.72)' : colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 32,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    // The archetype colour rides on the leading edge as well as the dot, so
    // the class reads at a glance without depending on colour alone.
    borderLeftWidth: 3,
    maxWidth: '100%',
  },
  chipStage: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    flexShrink: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  stagedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
