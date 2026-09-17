import { GameText as Text, GamePanel } from '@/components/game';
import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useThemedColors } from '@/hooks/useThemedColors';
import { loadTutorial, updateTutorial } from '@/utils/tutorial';
import {
  tutorialHint,
  type TutorialState,
  type TutorialHintKey,
} from '@/utils/tutorialState';

/** Optional inline guidance. Dismissals and first payoff survive app restarts. */
export default function TutorialCoach({
  battleId,
  stage,
}: {
  battleId: string;
  stage: TutorialHintKey;
}) {
  const { user } = useAuth();
  const colors = useThemedColors();
  const router = useRouter();
  const [state, setState] = useState<TutorialState | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState(null);
    setError(false);
    if (user)
      void loadTutorial(user.id)
        .then(async (value) => {
          if (!active) return;
          setState(value);
          if (
            stage === 'result' &&
            value?.battle_id === battleId &&
            !value.completed_at
          ) {
            const completed = await updateTutorial(battleId);
            if (active) setState(completed);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    return () => {
      active = false;
    };
  }, [user, battleId, stage, retry]);
  const text = tutorialHint(state, battleId, stage);
  if (error)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setRetry((v) => v + 1)}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.textSecondary }}>
          Retry practice guidance
        </Text>
      </Pressable>
    );
  if (!text) return null;
  return (
    <GamePanel
      tone="ornate"
      style={{
        padding: 12,
        gap: 8,
        backgroundColor: colors.card,
        borderRadius: 12,
        marginVertical: 8,
      }}
    >
      <Text
        variant="title"
        accessibilityRole="header"
        style={{ color: colors.text, fontWeight: '600' }}
      >
        Practice guide
      </Text>
      <Text style={{ color: colors.text }}>{text}</Text>
      {stage === 'result' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/(profile)/edit-character')}
          style={{ minHeight: 48, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.primary }}>
            Make your fighter your own · Customize
          </Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss practice hint"
        onPress={() => {
          void updateTutorial(battleId, stage)
            .then(setState)
            .catch(() => setError(true));
        }}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text style={{ color: colors.primary }}>Got it</Text>
      </Pressable>
    </GamePanel>
  );
}
