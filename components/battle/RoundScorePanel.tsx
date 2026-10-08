import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { GamePanel, GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';

type RoundScores = {
  player_one_score?: number | null;
  player_two_score?: number | null;
};

/** Recorded round scores, independent of series wins and received damage. */
export default function RoundScorePanel({
  round,
  isPlayerOne,
  isPracticeBot,
}: {
  round: RoundScores;
  isPlayerOne: boolean;
  isPracticeBot: boolean;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const scores = [
    {
      label: 'You',
      score: isPlayerOne ? round.player_one_score : round.player_two_score,
    },
    {
      label: isPracticeBot ? 'AI opponent · Practice' : 'Opponent',
      score: isPlayerOne ? round.player_two_score : round.player_one_score,
    },
  ].filter((side) => side.score != null && Number.isFinite(side.score));
  if (scores.length === 0) return null;

  return (
    <GamePanel style={{ gap: 12 }}>
      <GameText variant="title" accessibilityRole="header">
        Round score
      </GameText>
      <View
        style={{
          flexDirection: width < 350 || fontScale > 1.35 ? 'column' : 'row',
          gap: 16,
        }}
      >
        {scores.map(({ label, score }) => {
          const value = score!.toLocaleString(undefined, {
            maximumFractionDigits: 3,
          });
          return (
            <View
              key={label}
              style={{ flex: 1, minWidth: 0, gap: 8 }}
              accessible
              accessibilityLabel={`${label}, round score ${value}`}
            >
              <GameText variant="label" style={{ color: colors.textSecondary }}>
                {label}
              </GameText>
              <GameText
                variant="title"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {value}
              </GameText>
            </View>
          );
        })}
      </View>
    </GamePanel>
  );
}
