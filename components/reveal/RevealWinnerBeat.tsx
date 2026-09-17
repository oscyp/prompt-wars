import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { GameText } from '@/components/game';
import FighterCard from '@/components/game/FighterCard';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import { useThemedColors } from '@/hooks/useThemedColors';
import { MOVE_META } from '@/constants/MoveTypes';
import { hapticImpact } from '@/utils/haptics';
import { moveLabel } from '@/utils/battleCopy';
import type { MoveType } from '@/utils/battles';
import type { EquippedCosmetics } from '@/utils/cosmetics';
import {
  winnerBeatCopy,
  type RevealSide,
  type StingPreset,
} from '@/utils/revealBeats';
import {
  imageSourceChain,
  STING_DELAY_MS,
  type RevealInsets,
} from '@/utils/revealLayout';
import MoveSting from './MoveSting';

export interface RevealWinnerBeatProps {
  winner: RevealSide;
  isMe: boolean;
  isKo: boolean;
  color: string;
  fighterUrl: string | null;
  avatarUrl: string | null;
  cosmetics?: EquippedCosmetics;
  sting: StingPreset | null;
  reduceMotion: boolean;
  insets: RevealInsets;
}

/** A contained collector card keeps the winner's face, equipment and name intact. */
export default function RevealWinnerBeat({
  winner,
  isMe,
  isKo,
  color,
  fighterUrl,
  avatarUrl,
  cosmetics,
  sting,
  reduceMotion,
  insets,
}: RevealWinnerBeatProps) {
  const colors = useThemedColors();
  const active = useBattlePresentationActive();
  const copy = winnerBeatCopy({
    name: winner.name,
    isMe,
    isKo,
    battleCry: winner.battleCry,
  });
  const chain = useMemo(
    () => imageSourceChain([fighterUrl, winner.portraitUrl, avatarUrl]),
    [fighterUrl, winner.portraitUrl, avatarUrl],
  );
  const [failed, setFailed] = useState(0);
  useEffect(() => setFailed(0), [chain]);
  const move: MoveType | null =
    winner.moveType === 'attack' ||
    winner.moveType === 'defense' ||
    winner.moveType === 'finisher'
      ? winner.moveType
      : null;
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <GameText
        variant="display"
        style={{ color: colors.ornament, textAlign: 'center' }}
      >
        {copy.kicker}
      </GameText>
      <Animated.View
        entering={!reduceMotion && active ? FadeIn.duration(240) : undefined}
        style={styles.card}
      >
        <FighterCard
          name={copy.name}
          archetype={winner.archetype}
          battleCry={winner.battleCry}
          renderUri={chain[failed] ?? null}
          avatarUri={avatarUrl}
          signatureColor={color}
          cosmetics={cosmetics}
          onImageError={() => setFailed((n) => n + 1)}
        />
        <MoveSting
          preset={sting}
          color={color}
          delayMs={STING_DELAY_MS}
          onLanded={hapticImpact}
        />
      </Animated.View>
      {move ? (
        <View style={styles.move}>
          <GameSymbol
            name={MOVE_META[move].icon}
            size={20}
            color={colors[move]}
          />
          <GameText variant="label">{moveLabel(move)}</GameText>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  card: { width: '100%' },
  move: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
