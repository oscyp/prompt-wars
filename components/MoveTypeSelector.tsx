import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { GameButton, GameText } from './game';
import { MOVE_META } from '@/constants/MoveTypes';
import type { MoveType } from '@/utils/battles';
import { hapticSelection } from '@/utils/haptics';
import { useThemedColors } from '@/hooks/useThemedColors';

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

export default function MoveTypeSelector({
  value,
  onChange,
  suggestedCounter = null,
}: Props) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const horizontal = width >= 390 && fontScale <= 1.15;
  return (
    <View style={{ flexDirection: horizontal ? 'row' : 'column', gap: 8 }}>
      {(['attack', 'defense', 'finisher'] as MoveType[]).map((type) => {
        const { icon, beats, losesTo } = MOVE_META[type];
        return (
          <View key={type} style={horizontal ? { flex: 1 } : undefined}>
            <GameButton
              tone="secondary"
              label={type.toUpperCase()}
              icon={icon}
              selected={value === type}
              accessibilityLabel={`Select ${type} move${suggestedCounter === type ? ', counters opponent pattern' : ''}`}
              accessibilityHint={`Beats ${beats}, loses to ${losesTo}`}
              onPress={() => {
                hapticSelection();
                onChange(type);
              }}
              style={{
                borderColor:
                  value === type ? colors[type] : colors.ornamentMuted,
                paddingHorizontal: 8,
                flexDirection: horizontal ? 'column' : 'row',
              }}
              labelStyle={{ color: colors[type] }}
            />
            {suggestedCounter === type && (
              <GameText
                variant="caption"
                style={{ color: colors.success, textAlign: 'center' }}
              >
                COUNTER
              </GameText>
            )}
          </View>
        );
      })}
    </View>
  );
}
