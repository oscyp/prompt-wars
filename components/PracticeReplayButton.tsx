import { GameNavRow } from '@/components/game';

import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { startTutorial } from '@/utils/tutorial';
export default function PracticeReplayButton() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  return (
    <GameNavRow
      gameIcon="replay"
      busy={busy}
      style={{ marginBottom: 8 }}
      onPress={async () => {
        setBusy(true);
        try {
          const id = await startTutorial(true);
          router.push(`/(battle)/prompt-entry?battleId=${id}`);
        } catch (e) {
          Alert.alert(
            'Practice unavailable',
            e instanceof Error ? e.message : 'Try again.',
          );
        } finally {
          setBusy(false);
        }
      }}
      title={busy ? 'Preparing practice…' : 'Replay practice guide'}
    />
  );
}
