import { invokeAuthenticatedFunction } from './supabase';
import type { BattleRound } from '@/types/battle';
export type AppealStatus =
  | 'pending'
  | 'processing'
  | 'retryable_failure'
  | 'upheld'
  | 'overturned'
  | 'no_contest';
export interface BattleAppeal {
  id: string;
  review_status: AppealStatus;
  last_error?: string | null;
  review_metadata?: Record<string, unknown> | null;
}
export interface AppealAvailability {
  appeal: BattleAppeal | null;
  available: boolean;
  reason: string | null;
}
export function readBattleAppeal(
  battleId: string,
  action: 'status' | 'submit' = 'status',
) {
  return invokeAuthenticatedFunction<AppealAvailability>('appeal-battle', {
    battle_id: battleId,
    action,
  });
}
export function reviewedRounds(
  original: BattleRound[],
  metadata: unknown,
  p1: string,
  p2: string | null,
): BattleRound[] {
  const reviews = (
    metadata as {
      rounds?: {
        roundId?: string;
        winner: number | null;
        isDraw: boolean;
        isKo: boolean;
        playerOneScore: number;
        playerTwoScore: number;
        playerOneHpAfter: number;
        playerTwoHpAfter: number;
        playerOneDamage: number;
        playerTwoDamage: number;
        scoreGap: number;
        judge?: BattleRound['judge_payload'];
      }[];
    } | null
  )?.rounds;
  if (!reviews) return original;
  return reviews.flatMap((r) => {
    const old = original.find((o) => o.id === r.roundId);
    return old
      ? [
          {
            ...old,
            round_winner_id: r.winner === 1 ? p1 : r.winner === 2 ? p2 : null,
            is_draw: r.isDraw,
            is_ko: r.isKo,
            player_one_score: r.playerOneScore,
            player_two_score: r.playerTwoScore,
            player_one_hp_after: r.playerOneHpAfter,
            player_two_hp_after: r.playerTwoHpAfter,
            player_one_damage: r.playerOneDamage,
            player_two_damage: r.playerTwoDamage,
            score_gap: r.scoreGap,
            judge_payload: r.judge ?? old.judge_payload,
          },
        ]
      : [];
  });
}
export function appealStatusCopy(status: AppealStatus): string {
  return {
    pending: 'Appeal submitted. Independent review is queued.',
    processing: 'An independent judge is reviewing the played rounds.',
    retryable_failure:
      'Review was interrupted. It will retry automatically; your daily allowance is protected.',
    upheld: 'Independent review upheld the result.',
    overturned:
      'Independent review changed the result. Original rating points were reversed; no replacement rating was awarded.',
    no_contest:
      'No contest. The review needs a round that was never played. Original rating points were reversed; this battle does not count as a win, loss or draw.',
  }[status];
}
