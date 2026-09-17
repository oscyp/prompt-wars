import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { STAT_KEYS, STAT_MAX, STAT_META } from '@/utils/statAllocation';
import type { StatBlock } from '@/types/battle';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameBevel } from './GameBevel';
import { GameText } from './GameText';

export function FighterStatTray({
  stats,
  availableWidth,
  fontScale,
}: {
  stats: StatBlock;
  availableWidth: number;
  fontScale: number;
}) {
  const colors = useThemedColors();
  const layoutKey = `${availableWidth}:${fontScale}`;
  const [wrappedAt, setWrappedAt] = useState<string | null>(null);
  const columns =
    availableWidth < 300 || fontScale > 1.15 || wrappedAt === layoutKey ? 2 : 4;
  const rows =
    columns === 4 ? [STAT_KEYS] : [STAT_KEYS.slice(0, 2), STAT_KEYS.slice(2)];
  return (
    <View
      testID="fighter-stat-tray"
      style={[styles.tray, { backgroundColor: colors.card }]}
    >
      <GameBevel
        color={colors.ornament}
        insetColor={colors.ornamentMuted}
        cut={8}
      />
      {rows.map((row, rowIndex) => (
        <View
          testID={`stat-tray-row-${rowIndex}`}
          key={rowIndex}
          style={[
            styles.row,
            rowIndex > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: colors.ornamentMuted,
            },
          ]}
        >
          {row.map((key, index) => {
            const value = Math.max(
              0,
              Math.min(STAT_MAX, Math.round(stats[key])),
            );
            return (
              <React.Fragment key={key}>
                {index > 0 && (
                  <View
                    testID={`stat-tray-divider-${rowIndex}-${index}`}
                    accessible={false}
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.divider,
                      { backgroundColor: colors.ornamentMuted },
                    ]}
                  >
                    <View
                      style={[
                        styles.diamond,
                        { backgroundColor: colors.ornament },
                      ]}
                    />
                  </View>
                )}
                <View
                  testID={`stat-tray-cell-${key}`}
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={`${STAT_META[key].label} ${value} of ${STAT_MAX}`}
                  accessibilityValue={{ min: 0, max: STAT_MAX, now: value }}
                  style={styles.cell}
                >
                  <GameText
                    variant="label"
                    onTextLayout={(event) => {
                      if (columns === 4 && event.nativeEvent.lines.length > 1)
                        setWrappedAt(layoutKey);
                    }}
                    style={[styles.label, { color: colors.textSecondary }]}
                  >
                    {STAT_META[key].label.toUpperCase()}
                  </GameText>
                  <GameText variant="fighter" style={styles.value}>
                    {value}
                  </GameText>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  tray: { paddingHorizontal: 9, paddingVertical: 5, width: '100%' },
  row: { flexDirection: 'row', alignItems: 'stretch', paddingVertical: 5 },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingHorizontal: 2,
    gap: 1,
  },
  label: {
    textAlign: 'center',
    letterSpacing: 0.4,
    fontSize: 16,
    lineHeight: 21,
  },
  value: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontSize: 30,
    lineHeight: 35,
  },
  divider: {
    width: 1,
    marginVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: { width: 4, height: 4, transform: [{ rotate: '45deg' }] },
});
