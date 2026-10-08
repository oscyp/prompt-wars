import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import CosmeticFrame from '@/components/CosmeticFrame';
import HPBar from '@/components/HPBar';
import { getArchetypeAvatar } from '@/constants/ArchetypeAvatars';
import { GamePanel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { BattleCharacterInfo } from '@/hooks/useBattleCharacters';
type ImpactRound = {
  player_one_hp_after?: number | null;
  player_two_hp_after?: number | null;
  player_one_damage?: number | null;
  player_two_damage?: number | null;
};
export function roundImpactSides(round: ImpactRound, isPlayerOne: boolean) {
  const p1 = { hp: round.player_one_hp_after, damage: round.player_one_damage };
  const p2 = { hp: round.player_two_hp_after, damage: round.player_two_damage };
  return { mine: isPlayerOne ? p1 : p2, theirs: isPlayerOne ? p2 : p1 };
}
export default function RoundImpact({
  round,
  isPlayerOne,
  mine,
  theirs,
  myMax,
  theirMax,
}: {
  round: ImpactRound;
  isPlayerOne: boolean;
  mine: BattleCharacterInfo | null;
  theirs: BattleCharacterInfo | null;
  myMax: number;
  theirMax: number;
}) {
  const sides = roundImpactSides(round, isPlayerOne);
  const { fontScale } = useWindowDimensions();
  return (
    <GamePanel>
      <View
        style={{ flexDirection: fontScale > 1.35 ? 'column' : 'row', gap: 16 }}
      >
        <ImpactFighter info={mine} label="You" side={sides.mine} max={myMax} />
        <ImpactFighter
          info={theirs}
          label="Opponent"
          side={sides.theirs}
          max={theirMax}
        />
      </View>
    </GamePanel>
  );
}
function ImpactFighter({
  info,
  label,
  side,
  max,
}: {
  info: BattleCharacterInfo | null;
  label: string;
  side: { hp: number | null | undefined; damage: number | null | undefined };
  max: number;
}) {
  const colors = useThemedColors();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uri = info?.portraitUrl;
  return (
    <View style={{ flex: 1, gap: 8, alignItems: 'center' }}>
      <GameText variant="label">{label}</GameText>
      <CosmeticFrame
        size={96}
        source={
          uri && uri !== failedUrl
            ? { uri }
            : getArchetypeAvatar(info?.archetype)
        }
        frame={info?.cosmetics?.frame}
        accentColor={info?.signatureColor}
        accessibilityLabel={`${info?.name ?? label} portrait`}
        onImageError={() => setFailedUrl(uri ?? null)}
      />
      <GameText variant="title" style={{ textAlign: 'center' }}>
        {info?.name ?? label}
      </GameText>
      {side.hp == null ? null : (
        <View style={{ alignSelf: 'stretch' }}>
          <HPBar
            side={label === 'You' ? 'left' : 'right'}
            current={side.hp}
            max={max}
            playerName={info?.name ?? label}
          />
        </View>
      )}
      {side.damage == null ? null : (
        <View
          accessible
          accessibilityLabel={`${label} received ${side.damage} damage`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <GameIcon name="attack" size={20} color={colors.attack} />
          <GameText variant="title" style={{ color: colors.attack }}>
            {side.damage > 0 ? `−${side.damage}` : side.damage}
          </GameText>
        </View>
      )}
    </View>
  );
}
