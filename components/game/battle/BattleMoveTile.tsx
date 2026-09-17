import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GameBevel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { MOVE_META } from '@/constants/MoveTypes';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';

export const MOVE_TILE_COLORS = {
  attack: '#FF996C',
  defense: '#8ADBF5',
  finisher: '#BE9AF1',
};
export function BattleMoveTile({
  move,
  selected,
  onPress,
  horizontal,
}: {
  move: MoveType;
  selected: boolean;
  onPress: () => void;
  horizontal: boolean;
}) {
  const color = MOVE_TILE_COLORS[move];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${moveLabel(move)}. Beats ${moveLabel(MOVE_META[move].beats)}`}
      style={({ pressed }) => [
        styles.tile,
        horizontal && { flex: 1 },
        {
          opacity: pressed ? 0.8 : 1,
          shadowColor: color,
          shadowOpacity: selected ? 0.65 : 0,
        },
      ]}
    >
      <GameBevel
        color={selected ? color : '#A88754'}
        insetColor={selected ? color : '#655A72'}
        strokeWidth={selected ? 2.5 : 1}
        gradient={selected ? ['#302130', '#11111D'] : ['#191825', '#0D101A']}
      />
      <GameIcon
        name={MOVE_META[move].gameIcon}
        size={40}
        color={color}
        accent="#FFF1D1"
      />
      <GameText
        variant="label"
        style={{ color, textAlign: 'center', fontSize: 18 }}
      >
        {moveLabel(move).toUpperCase()}
      </GameText>
      {selected && (
        <View
          testID={`move-selected-${move}`}
          style={[
            styles.check,
            { borderColor: color, backgroundColor: '#281D28' },
          ]}
        >
          <GameIcon name="check" size={18} color="#FFF1DF" />
        </View>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  tile: {
    minHeight: 98,
    padding: 12,
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  check: {
    position: 'absolute',
    right: 7,
    top: 7,
    borderRadius: 13,
    borderWidth: 1.5,
    padding: 2,
  },
});
