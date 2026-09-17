import { GameScreen, GameHeader, GameButton } from '@/components/game';
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BATTLE_MODES, BattleMode } from '@/constants/BattleModes';
import ModeCard from '@/components/ModeCard';

/**
 * Full-screen battle-mode picker. The raised center tab button opens the
 * bottom-sheet variant instead; this screen stays as the deep-link /
 * notification target for the `create` route (same cards, same routing).
 */
export default function CreateScreen() {
  const router = useRouter();

  const startBattle = (mode: BattleMode) => {
    router.push(`/(battle)/matchmaking?mode=${mode}`);
  };

  return (
    <GameScreen>
      <GameButton
        label="Arena"
        accessibilityLabel="Return to Arena"
        tone="secondary"
        icon="chevron-back"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/(tabs)/home')
        }
      />
      <GameHeader title="START A BATTLE" subtitle="Choose your battle mode" />
      <View style={{ gap: 16 }}>
        {BATTLE_MODES.map((info) => (
          <ModeCard key={info.mode} info={info} onPress={startBattle} />
        ))}
      </View>
    </GameScreen>
  );
}
