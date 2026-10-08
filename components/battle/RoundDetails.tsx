import React from 'react';
import { View } from 'react-native';
import { GamePanel, GameText } from '@/components/game';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import RubricBars from '@/components/RubricBars';
import { MOVE_META } from '@/constants/MoveTypes';
import { useThemedColors } from '@/hooks/useThemedColors';
import { moveLabel } from '@/utils/battleCopy';
import {
  formatPct,
  judgeNotesUnavailable,
  moveMatchupLine,
} from '@/utils/resultView';
import type { MoveType } from '@/utils/battles';
import type { RubricScoreSet } from '@/types/battle';

/** A read-only breakdown: nothing needs expanding before continuing the series. */
export default function RoundDetails({
  myMove,
  opponentMove,
  moveModifier,
  statModifier,
  scores,
  opponentScores,
  explanation,
  policyVersion,
}: {
  myMove: MoveType | null;
  opponentMove: MoveType | null;
  moveModifier: number;
  statModifier: number;
  scores: Partial<RubricScoreSet>;
  opponentScores: Partial<RubricScoreSet>;
  explanation: string;
  policyVersion?: string | null;
}) {
  const colors = useThemedColors();
  return (
    <>
      {myMove && opponentMove ? (
        <GamePanel style={{ gap: 12 }}>
          <GameText variant="title" accessibilityRole="header">
            Round modifiers
          </GameText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <GameSymbol
              name={MOVE_META[opponentMove].icon}
              size={22}
              color={colors[opponentMove]}
            />
            <GameText style={{ flex: 1 }}>
              They chose {moveLabel(opponentMove)}
            </GameText>
          </View>
          <GameText>
            {moveMatchupLine(myMove, opponentMove, moveModifier)}
          </GameText>
          <GameText>Stat modifier · {formatPct(statModifier)}</GameText>
        </GamePanel>
      ) : null}
      {Object.keys(scores).length > 0 ? (
        <GamePanel style={{ gap: 12 }}>
          <GameText variant="title" accessibilityRole="header">
            Scores
          </GameText>
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            Six things the judge scores, 0–10.
          </GameText>
          <RubricBars
            scores={scores}
            opponentScores={opponentScores}
            policyVersion={policyVersion}
          />
        </GamePanel>
      ) : null}
      <GamePanel style={{ gap: 12 }}>
        <GameText variant="title" accessibilityRole="header">
          Judge’s verdict
        </GameText>
        <GameText style={{ color: colors.textSecondary }}>
          {explanation || judgeNotesUnavailable('round')}
        </GameText>
      </GamePanel>
    </>
  );
}
