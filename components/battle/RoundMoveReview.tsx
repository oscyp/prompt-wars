import React, { useState } from 'react';
import { View } from 'react-native';
import { GameButton, GameText } from '@/components/game';
import type { BattleRound } from '@/types/battle';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Recorded inputs only. Never read current opponent prose while a round is open. */
export default function RoundMoveReview({
  round,
  isPlayerOne,
  expanded = false,
  onOpen,
}: {
  round: BattleRound;
  isPlayerOne: boolean;
  expanded?: boolean;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(expanded);
  const colors = useThemedColors();
  const frozen = round.judge_payload?.frozen_inputs;
  if (
    !round.situation_snapshot ||
    !['result_ready', 'expired'].includes(round.status) ||
    !frozen
  )
    return null;
  const mine = isPlayerOne ? frozen.player_one : frozen.player_two;
  const theirs = isPlayerOne ? frozen.player_two : frozen.player_one;
  return (
    <View style={{ gap: 12 }}>
      <GameButton
        label={open ? 'Hide moves' : 'Review moves'}
        tone="secondary"
        chrome="utility"
        accessibilityLabel={`${open ? 'Hide' : 'Review'} moves · Round ${round.round_number}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      />
      {open ? (
        <>
          <GameText variant="label">Situation</GameText>
          <GameText style={{ color: colors.textSecondary }}>
            {round.situation_snapshot.text}
          </GameText>
          {[
            ['Your move', mine],
            ['Opponent’s move', theirs],
          ].map(([label, move]) =>
            typeof move === 'object' && move?.text ? (
              <View
                key={String(label)}
                accessible
                accessibilityLabel={`${label}. ${move.text}`}
                style={{ gap: 8 }}
              >
                <GameText variant="label">{String(label)}</GameText>
                <GameText>{move.text}</GameText>
              </View>
            ) : null,
          )}
          {round.judge_payload?.explanation?.trim() ? (
            <View style={{ gap: 8 }}>
              <GameText variant="label">Judge’s verdict</GameText>
              <GameText style={{ color: colors.textSecondary }}>
                {round.judge_payload.explanation}
              </GameText>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
