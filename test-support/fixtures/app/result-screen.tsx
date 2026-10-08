import React, { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer } from 'expo-video';
import { GameButton, GameScreen, GameText } from '@/components/game';
import BattleBackdrop from '@/components/battle/BattleBackdrop';
import ResultVerdict from '@/components/battle/ResultVerdict';
import ResultMedia from '@/components/battle/ResultMedia';
import ResultRewards from '@/components/battle/ResultRewards';
import ResultDetails from '@/components/battle/ResultDetails';
import { buildResultRewardsModel } from '@/components/battle/resultRewardsView';
import type { BattleRound, RewardSummary } from '@/types/battle';
import { equipment, fighter } from '../mockupParity';
import ConfirmSheet from '@/components/sheets/ConfirmSheet';
import { upgradeSheetCopy, videoStatusCopy } from '@/utils/resultView';
import type { EntitlementCheck } from '@/utils/monetization';

/** Isolated component evidence. No account, battle, purchase or generation hooks. */
export default function ResultScreenFixture() {
  const {
    state = 'won',
    long,
    media,
    rewards,
    theme,
    cinematic,
    quote,
  } = useLocalSearchParams<{
    state?: string;
    long?: string;
    media?: string;
    rewards?: string;
    theme?: string;
    cinematic?: string;
    quote?: string;
  }>();
  const router = useRouter();
  const player = useVideoPlayer(null);
  const { width, height, fontScale } = useWindowDimensions();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteChanged, setQuoteChanged] = useState(false);
  const [quoteConfirmed, setQuoteConfirmed] = useState(false);
  const duration = quoteChanged
    ? 12
    : cinematic === '8'
      ? 8
      : cinematic === '12'
        ? 12
        : cinematic === '15'
          ? 15
          : 20;
  const quoteCheck: EntitlementCheck = {
    can_upgrade: true,
    method:
      quote === 'allowance'
        ? 'subscriber_round'
        : quote === 'grant'
          ? 'new_user_grant'
          : 'credit',
    cost_credits:
      quote === 'allowance' || quote === 'grant' ? 0 : quoteChanged ? 2 : 1,
    allowance_remaining: 4,
    target_duration_seconds: duration,
    cinematic_profile: duration >= 15 ? 'plus' : 'standard',
    duration_policy_version:
      duration === 15 ? 'cinematics-v2' : 'cinematics-v3',
  };
  const quoteCopy = upgradeSheetCopy(quoteCheck, 10);
  const [retryCount, setRetryCount] = useState(0);
  const outcome =
    state === 'no_contest'
      ? 'no_contest'
      : state === 'draw'
        ? 'draw'
        : state === 'lost' || state === 'overturned'
          ? 'lost'
          : 'won';
  const name =
    long === '1'
      ? 'Łucja García • 李小龍'
      : long === '2'
        ? 'AndrewTheUnbrokenKeeperOfTheAstralLibrary'
        : 'Mira';
  const revised = state === 'no_contest' || state === 'overturned';
  const reward: RewardSummary | null =
    rewards === 'unavailable' || rewards === 'pending'
      ? null
      : {
          credits_granted: rewards === 'quests' ? 0 : 4,
          credit_reasons: ['Fixture: participation award'],
          credits_eligible: state !== 'practice' && state !== 'exhibition',
          win_streak_after: 3,
          best_win_streak: 7,
          streak_milestone: true,
          quests_advanced: ['first_victory', 'finisher_focus', 'three_battles'],
          quests_completed: [
            {
              quest_type: 'first_victory',
              title: 'First Victory',
              reward_credits: 2,
            },
            {
              quest_type: 'finisher_focus',
              title: 'Finisher Focus',
              reward_credits: 1,
            },
          ],
          mode: state === 'practice' ? 'bot' : 'ranked',
        };
  const rewardModel = buildResultRewardsModel({
    outcome: outcome === 'no_contest' ? 'draw' : outcome,
    isBot: state === 'practice',
    mode: state === 'practice' ? 'bot' : 'ranked',
    exhibition: state === 'exhibition',
    reviewStatus: revised
      ? state === 'no_contest'
        ? 'no_contest'
        : 'overturned'
      : null,
    rating: {
      delta: 22,
      line: 'Rating +22',
      gated: false,
    },
    reward,
    battleCompleted: rewards !== 'pending',
  });
  const themeText =
    theme === 'missing'
      ? null
      : theme === 'long'
        ? 'A promise beneath the longest winter sky — Żywioły i cisza przed burzą'
        : 'The calm before the storm';
  const fixtureRounds: BattleRound[] = [1, 2].map((number) => ({
    id: `fixture-round-${number}`,
    battle_id: 'fixture-battle',
    round_number: number,
    status: 'result_ready',
    lock_in_deadline: null,
    player_one_locked_at: null,
    player_two_locked_at: null,
    both_locked_at: null,
    round_winner_id: outcome === 'lost' ? 'fixture-opponent' : 'fixture-me',
    is_draw: state === 'draw',
    is_ko: false,
    player_one_score: 41.5,
    player_two_score: 33.8,
    score_gap: 7.7,
    player_one_damage: 26,
    player_two_damage: 0,
    player_one_hp_after: 72,
    player_two_hp_after: 54 - 26 * number,
    judge_payload: null,
    judge_prompt_version: null,
    judge_model_id: null,
    stat_modifier_player_one: null,
    stat_modifier_player_two: null,
    move_type_modifier_player_one: null,
    move_type_modifier_player_two: null,
    created_at: '',
    updated_at: '',
    resolved_at: null,
  }));
  return (
    <GameScreen
      background={<BattleBackdrop theme="The calm before the storm" />}
      contentContainerStyle={{ gap: 20 }}
      footer={
        <View style={{ padding: 16 }}>
          <GameButton
            label="Back to fixtures"
            tone="secondary"
            onPress={() => router.replace('/')}
          />
        </View>
      }
    >
      <GameText variant="caption">
        DEV · component fixture · no live actions
      </GameText>
      {cinematic || quote ? (
        <GameText variant="caption">
          DEV · {width}×{height} points · font scale {fontScale.toFixed(2)}
        </GameText>
      ) : null}
      {quote ? (
        <>
          <GameButton
            label="DEV Preview cinematic quote"
            onPress={() => setQuoteOpen(true)}
          />
          {quoteChanged ? (
            <GameText>
              DEV · quote changed locally; review again. Nothing was spent.
            </GameText>
          ) : null}
          {quoteConfirmed ? (
            <GameText>
              DEV · confirmation recorded locally. Nothing was spent.
            </GameText>
          ) : null}
          <ConfirmSheet
            visible={quoteOpen}
            {...quoteCopy}
            onCancel={() => setQuoteOpen(false)}
            onConfirm={() => {
              if (quote === 'changed' && !quoteChanged) setQuoteChanged(true);
              else {
                setQuoteConfirmed(true);
                setQuoteOpen(false);
              }
            }}
          />
        </>
      ) : null}
      <ResultVerdict
        outcome={outcome}
        isKo={state !== 'draw'}
        scoreLine={
          state === 'single'
            ? null
            : state === 'draw'
              ? '1–1'
              : outcome === 'lost'
                ? '0–2'
                : '2–0'
        }
        winnerSide={outcome === 'lost' ? 'them' : 'me'}
        me={{
          name,
          archetype: 'mystic',
          avatarUrl: fighter(name).avatarUri,
          signatureColor: '#B69AF8',
          cosmetics: equipment(2),
          role: 'You',
        }}
        them={{
          name: long === '1' ? 'Мария — Gardienne des Étoiles' : 'Cipher',
          archetype: 'engineer',
          avatarUrl: fighter('Cipher').avatarUri,
          signatureColor: '#78B6FF',
          cosmetics: equipment(0),
          role: 'Opponent',
          isBot: state === 'practice',
        }}
        finalHp={
          state === 'single'
            ? undefined
            : {
                me: {
                  current:
                    outcome === 'lost' ? 0 : outcome === 'draw' ? 50 : 72,
                  max: 100,
                },
                them: {
                  current:
                    outcome === 'lost' ? 72 : outcome === 'draw' ? 54 : 0,
                  max: 108,
                },
              }
        }
        adjudicationRevision={revised ? 1 : 0}
        ratingLine={revised ? rewardModel.correctionLine : null}
        exhibition={state === 'exhibition'}
      />
      {media ? (
        <>
          <ResultMedia
            videoUrl={media === 'replay' ? 'local-synthetic-preview' : null}
            player={player}
            playbackError={
              media === 'error' ? 'Fixture: signing unavailable' : null
            }
            retry={() => setRetryCount((count) => count + 1)}
            status={
              media === 'pending'
                ? cinematic
                  ? videoStatusCopy({
                      status: 'processing',
                      hasUrl: false,
                    })
                  : {
                      title: 'Cinematic in progress',
                      body: 'Your result is ready. Return later for the cinematic.',
                      tone: 'pending',
                    }
                : null
            }
            revised={revised}
            roundNumber={2}
          />
          {media === 'replay' ? (
            <GameText variant="caption">
              DEV · empty preview; no playable video. Controls only.
            </GameText>
          ) : null}
          {retryCount > 0 ? (
            <GameText variant="caption">
              DEV · local retry count {retryCount}; no generation or purchase
            </GameText>
          ) : null}
        </>
      ) : null}
      {rewards ? <ResultRewards model={rewardModel} /> : null}
      <ResultDetails
        theme={themeText}
        isBo3={state !== 'single'}
        rounds={fixtureRounds}
        myProfileId="fixture-me"
        playerOneId="fixture-me"
        noContest={state === 'no_contest'}
        info={{
          rewards: rewardModel,
          decisionExplanation: revised
            ? null
            : 'Decided by round majority · You 2 · Opponent 0.',
          judgeLine:
            'Fixture commentary: character voice and theme interpretation.',
          matchupNote: null,
          judgeNotesHistorical: revised,
        }}
        onViewQuests={() => router.replace('/')}
      />
    </GameScreen>
  );
}
