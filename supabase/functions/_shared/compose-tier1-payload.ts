// Tier 1 per-round payload composition.
//
// CRITICAL INVARIANTS:
//   * Outcome is read ONLY from `battle_rounds` (server-resolved, frozen).
//     Never from any video result or pending state.
//   * Composition is pure: same inputs -> identical payload + hash.
//   * No provider calls happen here; this builds the request body the adapter
//     will send.
//
// Output is the shape the AiVideoProvider per-round adapter expects.

import { MoveType } from './types.ts';
import {
  TIER1_PER_ROUND_DURATION_S,
  VIDEO_PROMPT_TEMPLATE_VERSION,
} from './video-constants.ts';

export type ShotIntent =
  | 'ko_finisher'
  | 'comeback'
  | 'tactical_win'
  | 'narrow_win'
  | 'draw';

export interface BattleRoundRow {
  id: string;
  battle_id: string;
  round_number: number;
  status: string;
  round_winner_id: string | null;
  is_draw: boolean;
  player_one_score: number | null;
  player_two_score: number | null;
  score_gap: number | null;
  player_one_damage: number;
  player_two_damage: number;
  player_one_hp_after: number | null;
  player_two_hp_after: number | null;
  is_ko: boolean;
  judge_payload: Record<string, unknown> | null;
  judge_prompt_version: string | null;
}

export interface BattleRow {
  id: string;
  player_one_id: string;
  player_two_id: string | null;
  is_player_two_bot: boolean;
  theme: string | null;
  current_round: number;
  player_one_rounds_won: number;
  player_two_rounds_won: number;
}

export interface CharacterSnapshot {
  user_id: string | null; // null for bot
  name: string;
  archetype: string;
  signature_color: string;
  voice_id: string | null;
  portrait_ref: string | null;
  stats_snapshot: Record<string, number>;
}

export interface PromptSnapshot {
  text_moderated: string;
  move_type: MoveType;
  pre_gen_moderation_id: string | null;
}

export interface SafetyContext {
  pre_gen_moderation_id: string | null;
  locale: string;
  blocked_terms_version: string;
}

export interface Tier1PerRoundPayload {
  battle_id: string;
  round_number: number;
  series_score_before: { player_one: number; player_two: number };
  series_score_after: { player_one: number; player_two: number };
  round_outcome: {
    winner_user_id: string | null;
    loser_user_id: string | null;
    damage: number;
    hp_after: { player_one: number | null; player_two: number | null };
    ko: boolean;
    judge_rationale_short: string;
  };
  characters: CharacterSnapshot[];
  prompts: PromptSnapshot[];
  framing: {
    winner_user_id: string | null;
    shot_intent: ShotIntent;
    music_sting_id: string;
    target_duration_s: number;
  };
  safety: SafetyContext;
  judge_prompt_version: string;
  video_prompt_template_version: string;
}

/**
 * Derive shot_intent from frozen round outcome + series score going INTO this
 * round (i.e. before this round's win is applied).
 */
export function deriveShotIntent(
  round: Pick<BattleRoundRow, 'is_ko' | 'is_draw' | 'score_gap' | 'round_winner_id'>,
  seriesBefore: { player_one: number; player_two: number },
  winnerIsPlayerOne: boolean,
): ShotIntent {
  if (round.is_draw || !round.round_winner_id) return 'draw';
  if (round.is_ko) return 'ko_finisher';

  const winnerWasDown = winnerIsPlayerOne
    ? seriesBefore.player_one < seriesBefore.player_two
    : seriesBefore.player_two < seriesBefore.player_one;
  if (winnerWasDown) return 'comeback';

  const gap = round.score_gap ?? 0;
  if (gap < 4) return 'narrow_win';
  return 'tactical_win';
}

function pickMusicSting(intent: ShotIntent, winnerArchetype: string): string {
  // Deterministic; client + server share this mapping.
  if (intent === 'ko_finisher') return `sting_ko_${winnerArchetype}`;
  if (intent === 'comeback') return `sting_comeback_${winnerArchetype}`;
  if (intent === 'narrow_win') return `sting_narrow_${winnerArchetype}`;
  if (intent === 'draw') return `sting_draw`;
  return `sting_tactical_${winnerArchetype}`;
}

function shortenRationale(payload: Record<string, unknown> | null): string {
  if (!payload) return '';
  const raw = (payload['explanation'] as string | undefined) ?? '';
  return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
}

export interface ComposeArgs {
  battle: BattleRow;
  round: BattleRoundRow;
  playerOne: CharacterSnapshot;
  playerTwo: CharacterSnapshot;
  playerOnePrompt: PromptSnapshot;
  playerTwoPrompt: PromptSnapshot;
  safety: SafetyContext;
}

/**
 * Build the Tier 1 per-round payload from frozen battle_rounds state.
 *
 * Throws if the round is not in a result_ready state — pay-to-win guardrail.
 */
export function composeTier1PerRoundPayload(args: ComposeArgs): Tier1PerRoundPayload {
  const { battle, round, playerOne, playerTwo, playerOnePrompt, playerTwoPrompt, safety } = args;

  if (round.status !== 'result_ready') {
    throw new Error(
      `composeTier1PerRoundPayload: round.status must be 'result_ready', got '${round.status}'`,
    );
  }

  // Series score BEFORE this round = current totals minus this round's contribution.
  const winnerIsP1 = round.round_winner_id === battle.player_one_id;
  const winnerIsP2 = !!battle.player_two_id && round.round_winner_id === battle.player_two_id;

  const seriesAfter = {
    player_one: battle.player_one_rounds_won,
    player_two: battle.player_two_rounds_won,
  };
  const seriesBefore = {
    player_one: seriesAfter.player_one - (winnerIsP1 ? 1 : 0),
    player_two: seriesAfter.player_two - (winnerIsP2 ? 1 : 0),
  };

  const shotIntent = deriveShotIntent(round, seriesBefore, winnerIsP1);
  const winnerArchetype = winnerIsP1
    ? playerOne.archetype
    : winnerIsP2
    ? playerTwo.archetype
    : 'neutral';

  const damage = winnerIsP1
    ? round.player_two_damage
    : winnerIsP2
    ? round.player_one_damage
    : 0;

  const loserUserId = round.is_draw
    ? null
    : winnerIsP1
    ? battle.player_two_id
    : battle.player_one_id;

  return {
    battle_id: battle.id,
    round_number: round.round_number,
    series_score_before: seriesBefore,
    series_score_after: seriesAfter,
    round_outcome: {
      winner_user_id: round.round_winner_id,
      loser_user_id: loserUserId,
      damage,
      hp_after: {
        player_one: round.player_one_hp_after,
        player_two: round.player_two_hp_after,
      },
      ko: round.is_ko,
      judge_rationale_short: shortenRationale(round.judge_payload),
    },
    characters: [playerOne, playerTwo],
    prompts: [playerOnePrompt, playerTwoPrompt],
    framing: {
      winner_user_id: round.round_winner_id,
      shot_intent: shotIntent,
      music_sting_id: pickMusicSting(shotIntent, winnerArchetype),
      target_duration_s: TIER1_PER_ROUND_DURATION_S,
    },
    safety,
    judge_prompt_version: round.judge_prompt_version ?? 'unknown',
    video_prompt_template_version: VIDEO_PROMPT_TEMPLATE_VERSION,
  };
}

/**
 * Stable canonical-JSON SHA256 of the payload for `input_payload_hash`
 * retry idempotency.
 */
export async function hashTier1Payload(payload: Tier1PerRoundPayload): Promise<string> {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
