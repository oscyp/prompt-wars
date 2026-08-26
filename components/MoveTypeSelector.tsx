import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import type { MoveType } from '@/utils/battles';
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
 */
export default function MoveTypeSelector({
  value,
  onChange,
  suggestedCounter = null,
}: Props) {
  const colors = useThemedColors();

  return (
    <View style={styles.row}>
      {MOVE_TYPES.map((type) => {
        const selected = value === type;
        return (
          <TouchableOpacity
            key={type}
            style={[
              styles.button,
              { backgroundColor: selected ? colors[type] : colors.card },
              selected && styles.buttonSelected,
            ]}
            onPress={() => {
              hapticSelection();
              onChange(type);
            }}
            accessibilityLabel={`Select ${type} move${
              suggestedCounter === type ? ', counters opponent pattern' : ''
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            {suggestedCounter === type ? (
              <View style={[styles.counterPill, { backgroundColor: colors.success }]}>
                <Text style={styles.counterPillText}>COUNTER</Text>
              </View>
            ) : null}
            <Ionicons
              name={MOVE_META[type].icon}
              size={20}
              color={selected ? '#FFFFFF' : colors[type]}
            />
            <Text
              style={[
                styles.text,
                { color: selected ? '#FFFFFF' : colors.text },
              ]}
            >
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
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
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
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
});
