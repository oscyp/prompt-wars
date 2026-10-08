import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import {
  GameButton,
  GameHeader,
  GamePanel,
  GameScreen,
  GameText,
  CreditAmount,
} from '@/components/game';
import BattleBackdrop from '@/components/battle/BattleBackdrop';
import RoundImpact from '@/components/battle/RoundImpact';
import ResultVerdict from '@/components/battle/ResultVerdict';
import ResultMedia from '@/components/battle/ResultMedia';
import ResultActions from '@/components/battle/ResultActions';
import { PlayerSafetyRow } from '@/components/PlayerSafetyActions';
import type { BattleCharacterInfo } from '@/hooks/useBattleCharacters';
import { equipment, fighter } from '../mockupParity';

/** Isolated presentation fixtures. No live account, battle or purchase is mutated. */
export default function RefinementFixture() {
  const { state = 'round', long } = useLocalSearchParams<{
    state?: string;
    long?: string;
  }>();
  const router = useRouter();
  const [navigated, setNavigated] = useState(0);
  const [retried, setRetried] = useState(0);
  const player = useVideoPlayer(null);
  const name = long === '1' ? 'Łucja García • 李小龍' : 'Mira';
  const mine: BattleCharacterInfo = {
    name,
    archetype: 'mystic',
    signatureColor: '#B69AF8',
    portraitUrl: fighter(name).avatarUri,
    fighterUrl: null,
    cosmetics: equipment(2),
  };
  const theirs: BattleCharacterInfo = {
    ...mine,
    name: 'Cipher',
    archetype: 'engineer',
    portraitUrl: null,
    cosmetics: equipment(0),
  };
  return (
    <GameScreen
      background={
        state === 'rows' ? undefined : (
          <BattleBackdrop theme="The calm before the storm" />
        )
      }
      header={
        <View style={{ paddingHorizontal: 16 }}>
          <GameText variant="caption">
            DEV · local component fixture · no live actions
          </GameText>
          <GameHeader
            presentation="secondary"
            title={state === 'rows' ? 'Battles' : 'Result'}
            trailing={<CreditAmount amount={1234567} />}
          />
        </View>
      }
      footer={
        <View style={{ padding: 16 }}>
          <GameButton label="Back to fixtures" onPress={() => router.back()} />
        </View>
      }
    >
      {state === 'round' && (
        <>
          <ResultVerdict outcome="won" isKo={false} scoreLine="1–0" />
          <RoundImpact
            round={{
              player_one_hp_after: 86,
              player_two_hp_after: 40,
              player_one_damage: 14,
              player_two_damage: 60,
            }}
            isPlayerOne
            mine={mine}
            theirs={theirs}
            myMax={100}
            theirMax={100}
          />
        </>
      )}
      {state === 'review' && (
        <>
          <ResultVerdict
            outcome="no_contest"
            isKo
            scoreLine="2–0"
            adjudicationRevision={2}
            ratingLine="Original rating points reversed. No replacement rating."
          />
          <ResultMedia
            videoUrl={null}
            player={player}
            playbackError={null}
            retry={() => setRetried(retried + 1)}
            status={null}
            revised
            roundNumber={2}
          />
          <ResultActions
            videoPlayable={false}
            revised
            busy={false}
            onShareCard={() => setNavigated(navigated + 1)}
            onShareVideo={() => {}}
            onReplay={() => setNavigated(navigated + 1)}
          />
          <GamePanel>
            <GameText variant="title">Rewards retained</GameText>
            <CreditAmount amount={3} signed />
          </GamePanel>
        </>
      )}
      {state === 'recovery' && (
        <>
          <ResultVerdict outcome="draw" isKo={false} scoreLine="1–1" />
          <ResultMedia
            videoUrl={null}
            player={player}
            playbackError="Fixture: signing unavailable"
            retry={() => setRetried(retried + 1)}
            status={null}
            revised={false}
            roundNumber={2}
          />
          <ResultActions
            videoPlayable={false}
            revised={false}
            busy={false}
            onShareCard={() => setNavigated(navigated + 1)}
            onShareVideo={() => {}}
            onReplay={() => setNavigated(navigated + 1)}
          />
          <GameText>
            Local retry taps: {retried}. No generation or purchase endpoint.
          </GameText>
          <GamePanel>
            <GameText variant="title">Rewards</GameText>
            <CreditAmount amount={null} />
          </GamePanel>
        </>
      )}
      {state === 'rows' && (
        <>
          <GameText>
            Navigation taps: {navigated}. Safety opens independently.
          </GameText>
          {[
            { name, human: true },
            { name: 'Practice bot', human: false },
          ].map((row) => (
            <PlayerSafetyRow
              key={row.name}
              profileId={row.human ? 'fixture-player' : null}
              name={row.name}
              framed
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open battle with ${row.name}`}
                onPress={() => setNavigated(navigated + 1)}
                style={{ padding: 16, minHeight: 96, gap: 8 }}
              >
                <GameText variant="fighter">{row.name}</GameText>
                <GameText>Victory · 2–0</GameText>
                <GameText variant="caption">Sep 22, 2026</GameText>
              </Pressable>
            </PlayerSafetyRow>
          ))}
        </>
      )}
    </GameScreen>
  );
}
