import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { GameText } from '@/components/game';
import { BattleMoveTile } from './BattleMoveTile';
import { MOVE_META } from '@/constants/MoveTypes';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';
import { useThemedColors } from '@/hooks/useThemedColors';

const MOVES: MoveType[] = ['attack', 'defense', 'finisher'];
export function BattleMovePicker({
  value,
  onChange,
}: {
  value: MoveType | null;
  onChange: (move: MoveType) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const horizontal = (measuredWidth ?? width - 40) >= 330 && fontScale <= 1.15;
  const colors = useThemedColors();
  return (
    <View style={styles.section}>
      <GameText
        variant="label"
        accessibilityRole="header"
        style={{ textAlign: 'center' }}
      >
        CHOOSE YOUR MOVE
      </GameText>
      <View
        testID="battle-move-options"
        onLayout={(event) => setMeasuredWidth(event.nativeEvent.layout.width)}
        style={[
          styles.options,
          { flexDirection: horizontal ? 'row' : 'column' },
        ]}
      >
        {MOVES.map((move) => (
          <BattleMoveTile
            key={move}
            move={move}
            selected={value === move}
            onPress={() => onChange(move)}
            horizontal={horizontal}
          />
        ))}
      </View>
      {value && (
        <GameText
          variant="caption"
          style={{ color: colors.textSecondary, textAlign: 'center' }}
        >
          {moveLabel(value)} beats {moveLabel(MOVE_META[value].beats)}
        </GameText>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 16 },
  options: { gap: 8 },
  option: {
    flex: 1,
    paddingHorizontal: 8,
    minHeight: 76,
    flexDirection: 'column',
  },
});
