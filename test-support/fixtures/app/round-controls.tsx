import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GameButton, GamePanel, GameScreen, GameText } from '@/components/game';
import { GameFeedback } from '@/components/game/GameFeedback';
import BrandMark from '@/components/game/BrandMark';
import BattleBackdrop from '@/components/battle/BattleBackdrop';
import RoundScorePanel from '@/components/battle/RoundScorePanel';
import RoundDetails from '@/components/battle/RoundDetails';
import RoundImpact from '@/components/battle/RoundImpact';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';
import QuestRow from '@/components/QuestRow';
import type { DailyQuest } from '@/utils/dailyMeta';
import { equipment } from '../mockupParity';
import { useVideoPlayer } from 'expo-video';
import ResultMedia from '@/components/battle/ResultMedia';
import { videoStatusCopy } from '@/utils/resultView';

/** Local presentation evidence only: no auth, battle, purchase or claim calls. */
export default function RoundControlsFixture() {
  const {
    state = 'round',
    busy,
    media = 'pending',
  } = useLocalSearchParams<{
    state?: string;
    busy?: string;
    media?: string;
  }>();
  const router = useRouter();
  const player = useVideoPlayer(null);
  const [retried, setRetried] = useState(0);
  if (state === 'startup') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: 24,
        }}
      >
        <BrandMark kind="emblem" size={104} />
        <BrandMark size={240} />
        <GameFeedback
          icon="arena"
          title="Opening your Arena…"
          busy
          layout="inline"
        />
        <GameText variant="caption">
          DEV · local startup component fixture
        </GameText>
      </View>
    );
  }
  const quest: DailyQuest = {
    id: 'fixture-quest',
    daily_quest_id: 'fixture-definition',
    current_value: 1,
    completed: false,
    completed_at: null,
    quest_date: '2026-09-26',
    quest: {
      id: 'fixture-definition',
      title: 'First Victory',
      description: 'Win your first battle today',
      quest_type: 'win',
      target_value: 1,
      reward_credits: 2,
      reward_xp: 0,
    },
  };
  return (
    <GameScreen
      background={
        state === 'round' || state === 'media' ? (
          <BattleBackdrop theme="The calm before the storm" />
        ) : undefined
      }
      contentContainerStyle={{ gap: 20, paddingHorizontal: 16 }}
      footer={
        <View style={{ padding: 16 }}>
          <GameButton
            label={
              state === 'round' ? 'Continue to round 2' : 'Back to fixtures'
            }
            onPress={() => router.replace('/')}
          />
        </View>
      }
    >
      <GameText variant="caption">
        DEV · local component fixture · no live actions
      </GameText>
      {state === 'media' ? (
        <>
          <ResultMedia
            player={player}
            videoUrl={null}
            playbackError={
              media === 'error' ? 'Fixture: media signing unavailable' : null
            }
            status={
              media === 'error'
                ? null
                : videoStatusCopy({
                    status: media === 'failed' ? 'failed' : 'processing',
                    hasUrl: false,
                    elapsedMs: media === 'slow' ? 120000 : 0,
                  })
            }
            retry={() => setRetried((value) => value + 1)}
            revised={false}
            roundNumber={2}
          />
          {retried > 0 ? (
            <GameText>Local retries: {retried}. No requests.</GameText>
          ) : null}
        </>
      ) : state === 'quests' ? (
        <GamePanel style={{ gap: 12 }}>
          <GameText variant="title">Daily Quests</GameText>
          <GameText>1 of 3 complete</GameText>
          <QuestRow quest={quest} claiming={busy === '1'} onClaim={() => {}} />
          <QuestRow
            quest={{
              ...quest,
              id: 'fixture-three',
              quest: {
                ...quest.quest!,
                title: 'Three Battles',
                description: 'Complete 3 battles',
                target_value: 3,
                reward_credits: 3,
              },
            }}
            onClaim={() => {}}
            isLast
          />
        </GamePanel>
      ) : (
        <>
          <GamePanel tone="ornate" style={{ gap: 16 }}>
            <GameText variant="display">Round 1 — Victory</GameText>
            <GameText>You lead 1–0</GameText>
            <SeriesScoreIndicator
              score={{ p1: 1, p2: 0 }}
              currentRound={1}
              format="bo3"
              framed={false}
            />
          </GamePanel>
          <RoundScorePanel
            round={{ player_one_score: 51, player_two_score: 19.125 }}
            isPlayerOne
            isPracticeBot
          />
          <RoundImpact
            round={{
              player_one_hp_after: 100,
              player_two_hp_after: 40,
              player_one_damage: 0,
              player_two_damage: 60,
            }}
            isPlayerOne
            mine={{
              name: 'Furrior',
              archetype: 'trickster',
              portraitUrl: null,
              fighterUrl: null,
              signatureColor: '#2ECC71',
              cosmetics: equipment(0),
            }}
            theirs={{
              name: 'Forge',
              archetype: 'titan',
              portraitUrl: null,
              fighterUrl: null,
              signatureColor: '#F87171',
              cosmetics: equipment(0),
            }}
            myMax={100}
            theirMax={100}
          />
          <GameText>Lock in by Sep 27 at 8:00 PM GMT+2</GameText>
          <RoundDetails
            myMove="attack"
            opponentMove="defense"
            moveModifier={0.1}
            statModifier={0.025}
            scores={{
              clarity: 8,
              originality: 9,
              specificity: 8,
              theme_fit: 9,
              archetype_fit: 8,
              dramatic_potential: 9,
            }}
            opponentScores={{
              clarity: 4,
              originality: 4,
              specificity: 3,
              theme_fit: 3,
              archetype_fit: 3,
              dramatic_potential: 3,
            }}
            explanation="Your prompt used a clear, inventive action and connected it to the theme."
          />
        </>
      )}
    </GameScreen>
  );
}
