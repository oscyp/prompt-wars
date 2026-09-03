import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import type { MoveType } from '@/utils/battles';
import { inkFor } from '@/utils/contrast';
import { hapticSelection } from '@/utils/haptics';

const MOVE_TYPES: MoveType[] = ['attack', 'defense', 'finisher'];

interface Props {
  value: MoveType | null;
  onChange: (moveType: MoveType) => void;
  /**
   * The move that counters the opponent's most frequent recent pick. Rendered
   * as a COUNTER pill; never inferred inside this component, because the two
   * screens that show it derive it from different data.
   */
  suggestedCounter?: MoveType | null;
}

/**
 * The three move-type buttons.
 *
 * Extracted from prompt-entry so move-select can own the strategic choice
 * while prompt-entry keeps only the writing. Presentational on purpose: it
 * holds no state and makes no decisions, so both screens stay the authority on
 * what a selection means.
 *
 * Ink on a selected button comes from `inkFor(fill)`, not a hardcoded white:
 * the dark palette's move colours are light pastels on which white fails AA.
 */
export default function MoveTypeSelector({
  value,
  onChange,
  suggestedCounter = null,
}: Props) {
  const colors = useThemedColors();
  const counterInk = inkFor(colors.success);

  return (
    <View style={styles.row}>
      {MOVE_TYPES.map((type) => {
        const selected = value === type;
        const fill = colors[type];
        const { icon, beats, losesTo } = MOVE_META[type];
        const textColor = selected ? inkFor(fill) : colors.text;
        const iconColor = selected ? inkFor(fill) : fill;
        return (
          <TouchableOpacity
            key={type}
            style={[
              styles.button,
              {
                backgroundColor: selected ? fill : colors.card,
                borderColor: selected ? fill : colors.border,
              },
              selected && styles.buttonSelected,
            ]}
            onPress={() => {
              hapticSelection();
              onChange(type);
            }}
            accessibilityLabel={`Select ${type} move${
              suggestedCounter === type ? ', counters opponent pattern' : ''
            }`}
            accessibilityHint={`Beats ${beats}, loses to ${losesTo}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            {suggestedCounter === type ? (
              <View
                style={[
                  styles.counterPill,
                  { backgroundColor: colors.success },
                ]}
              >
                <Text style={[styles.counterPillText, { color: counterInk }]}>
                  COUNTER
                </Text>
              </View>
            ) : null}
            <Ionicons name={icon} size={20} color={iconColor} />
            <Text style={[styles.text, { color: textColor }]}>
              {type.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: 56,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  buttonSelected: {
    transform: [{ scale: 1.03 }],
  },
  text: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  counterPill: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    zIndex: 1,
  },
  counterPillText: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
});
