import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { Spacing } from '@/constants/DesignTokens';
import StatChip from './StatChip';

export interface StatItem {
  label: string;
  value: string | number;
  accent?: string;
}

interface StatGridProps {
  stats: StatItem[];
  columns?: 2 | 3 | 4;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

/**
 * Responsive grid of StatChip — used by Profile, Stats, Wallet.
 */
export default function StatGrid({
  stats,
  columns = 2,
  size = 'md',
  style,
}: StatGridProps) {
  return (
    <View style={[styles.grid, style]}>
      {stats.map((s, idx) => (
        <View
          key={`${s.label}-${idx}`}
          style={[
            styles.cell,
            { width: `${100 / columns}%` },
          ]}
        >
          <StatChip {...s} size={size} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
  cell: {
    padding: Spacing.xs,
  },
});
