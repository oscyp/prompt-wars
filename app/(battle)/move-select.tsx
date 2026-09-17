import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
export default function LegacyBattleRoute() {
  const { battleId, round, moveType } = useLocalSearchParams<{
    battleId?: string;
    round?: string;
    moveType?: string;
  }>();
  return (
    <Redirect
      href={
        battleId
          ? {
              pathname: '/(battle)/prompt-entry',
              params: {
                battleId,
                ...(round ? { round } : {}),
                ...(moveType ? { moveType } : {}),
              },
            }
          : '/(tabs)/home'
      }
    />
  );
}
