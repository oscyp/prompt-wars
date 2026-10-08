import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GameButton, GameText } from '@/components/game';
import { getOpponentMoveHistory, type MoveType } from '@/utils/battles';
import { moveLabel } from '@/utils/battleCopy';

/** Only the server's resolved history; never the current hidden choice. */
export function OpponentMoveHistory({
  accountId,
  battleId,
  isBot,
}: {
  accountId: string | undefined;
  battleId: string;
  isBot: boolean;
}) {
  const scope = `${accountId}:${battleId}`;
  const [history, setHistory] = useState<{
    scope: string;
    moves: MoveType[];
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    setExpanded(false);
    if (!accountId || !battleId || isBot) return;
    getOpponentMoveHistory(battleId)
      .then((moves) => {
        if (active)
          setHistory({
            scope,
            moves: moves.slice(-5).map((move) => move.move_type),
          });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accountId, battleId, isBot, scope]);
  const moves = history?.scope === scope ? history.moves : [];
  if (isBot || !moves.length) return null;
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <GameButton
        label="Opponent’s recent moves"
        tone="secondary"
        chrome="text"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <GameText>
          Resolved moves, oldest to newest: {moves.map(moveLabel).join(' → ')}.
        </GameText>
      ) : null}
    </View>
  );
}
