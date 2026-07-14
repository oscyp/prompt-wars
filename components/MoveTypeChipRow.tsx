import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { MOVE_META } from '@/constants/MoveTypes';
import { MoveType } from '@/utils/battles';

export interface MoveTypeChipRowProps {
  history: MoveType[];
  label?: string;
  max?: number;
}

/**
 * Row of move-type chips for the last N moves. Color + icon shape (shared
 * MOVE_META set) so color-blind users get parity with the move buttons.
 */
export default function MoveTypeChipRow({
  history,
  label = "Opponent's last moves",
  max = 5,
}: MoveTypeChipRowProps) {
  const colors = useThemedColors();
  const shown = history.slice(-max);
  const palette: Record<MoveType, string> = {
    attack: colors.attack,
    defense: colors.defense,
    finisher: colors.finisher,
  };

  const a11y =
    shown.length === 0
      ? `${label}: none yet`
      : `${label}: ${shown.join(', ')}`;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={a11y}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.chips}>
        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textTertiary }]}>
            No history yet
          </Text>
        ) : (
          shown.map((m, idx) => (
            <View
              key={`${m}-${idx}`}
              style={[
                styles.chip,
                {
                  backgroundColor: palette[m],
                  borderColor: palette[m],
                },
              ]}
            >
              <Ionicons name={MOVE_META[m].icon} size={12} color="#FFFFFF" />
              <Text style={styles.chipText}>{m.toUpperCase()}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  empty: {
    fontSize: Typography.sizes.sm,
    fontStyle: 'italic',
  },
});
