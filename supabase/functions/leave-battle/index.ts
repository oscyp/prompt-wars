// Leave Battle Edge Function
//
// A player may leave a battle at any point. Before they have locked a prompt it
// is free; afterwards it costs credits — they are walking out on a commitment
// the opponent is already waiting on, and the credits are the toll for ending
// it now rather than making everyone sit out the deadline.
//
// The credits buy TIME, never OUTCOME. A ranked leave is a full loss: the win
// goes to the opponent, Glicko moves, the streak breaks. Paying more would not
// change that, and nothing about the payment reaches the judge or the reveal —
// the only record of it is one wallet_transactions row.
//
// Unranked, bot, and never-matched battles have no opponent whose record is
// worth adjusting, so they cancel rather than forfeit. They still cost credits
// once a prompt is locked: the player used the arena either way.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  successResponse,
} from '../_shared/utils.ts';
import { getEditPrice } from '../_shared/character-creation.ts';
import { buildLeaveScorePayload, leaveIdempotencyKey } from '../_shared/leave-battle.ts';
import { resolveForfeitBattle } from '../_shared/resolve-forfeit.ts';

interface LeaveBattleRequest {
  battle_id: string;
}

interface LeaveClaim {
  success: boolean;
  error?: string;
  action?: 'canceled' | 'forfeited' | 'already_terminal';
  charged?: number;
  replayed?: boolean;
  transaction_id?: string | null;
  previous_status?: string;
  winner_id?: string | null;
  loser_id?: string;
  mode?: string;
  format?: string;
  is_bot?: boolean;
  current_round?: number | null;
  player_one_rounds_won?: number | null;
  player_two_rounds_won?: number | null;
  player_one_id?: string;
  player_two_id?: string | null;
  balance?: number;
  price?: number;
  winner_rating?: number;
  winner_rating_deviation?: number;
  winner_rating_volatility?: number;
  loser_rating?: number;
  loser_rating_deviation?: number;
  loser_rating_volatility?: number;
}

const PRICE_KIND = 'leave_battle';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const { battle_id }: LeaveBattleRequest = await req.json();

    if (!battle_id) {
      return errorResponse('battle_id required');
    }

    const supabase = createServiceClient();

    // Priced from the table, not a constant, so the toll can be retuned without
    // a deploy. A missing row means free rather than a hard failure: an absent
    // price should never trap a player inside a battle.
    const price = await getEditPrice(supabase, PRICE_KIND);
    const credits = price?.credits ?? 0;

    // One call does the status claim, the lock check and the charge in a single
    // transaction. Splitting them would leave a window where a concurrent
    // submit-prompt flips the battle to 'resolving' between the charge and the
    // claim, and the player has paid for an exit that can no longer happen.
    const { data: claimRaw, error: claimErr } = await supabase.rpc(
      'claim_leave_battle',
      {
        p_battle_id: battle_id,
        p_profile_id: userId,
        p_credits: credits,
        // Server-generated. A client-supplied key would let a caller replay
        // somebody else's charge or dodge their own.
        p_idempotency_key: leaveIdempotencyKey(battle_id, userId),
      },
    );

    if (claimErr) {
      console.error('claim_leave_battle failed:', claimErr);
      return errorResponse('Could not leave the battle', 500);
    }

    const claim = (claimRaw ?? {}) as LeaveClaim;

    if (!claim.success) {
      switch (claim.error) {
        case 'battle_not_found':
          return errorResponse('Battle not found', 404);
        case 'not_participant':
          return errorResponse('Battle participant required', 403);
        case 'battle_in_progress':
          return errorResponse('Battle has already started', 409);
        case 'insufficient_credits': {
          const bal = claim.balance ?? 0;
          const want = claim.price ?? credits;
          return errorResponse(
            'Not enough credits to leave this battle',
            402,
            {
              code: 'insufficient_credits',
              price: want,
              balance: bal,
              shortfall: Math.max(0, want - bal),
            },
          );
        }
        default:
          console.error('claim_leave_battle rejected:', claim.error);
          return errorResponse('Could not leave the battle', 500);
      }
    }

    const charged = claim.charged ?? 0;

    if (claim.action === 'already_terminal' || claim.action === 'canceled') {
      return successResponse({
        success: true,
        action: claim.action,
        credits_charged: charged,
      });
    }

    // ---- Ranked human forfeit -------------------------------------------
    // The battle is now in 'resolving' and everything past here runs OUTSIDE
    // the claim's transaction. This is the one refundable seam in the flow.

    const winnerId = claim.winner_id as string;

    // §7.8 opponent diversity, applied exactly as battle-advance applies it on
    // a scored series. A leave-farm is more attractive than a normal farm
    // because it is instant, so the gate matters more here, not less.
    //
    // The quality floor is deliberately NOT applied: it withholds rating from
    // both sides to stop garbage-prompt farming, and used here it would shield
    // the leaver from the loss they are choosing — inverting its purpose.
    let ratingGated = false;
    if (claim.mode === 'ranked' && !claim.is_bot) {
      const { data: diverse, error: diverseErr } = await supabase.rpc(
        'ranked_rating_is_diverse',
        {
          p_profile_id: claim.player_one_id,
          p_opponent_id: claim.player_two_id,
        },
      );
      if (diverseErr) {
        // Fail open, same reasoning as battle-advance: withholding rating from
        // an honest player because a query failed is worse than one extra
        // rated battle between a pair we merely suspect.
        console.error('ranked_rating_is_diverse failed:', diverseErr);
      } else {
        ratingGated = diverse === false;
      }
    }

    const scorePayload = buildLeaveScorePayload({
      leaverId: userId,
      format: claim.format ?? 'single',
      currentRound: claim.current_round,
      playerOneRoundsWon: claim.player_one_rounds_won,
      playerTwoRoundsWon: claim.player_two_rounds_won,
      ratingGated: ratingGated ? 'diversity' : null,
    });

    try {
      const resolved = await resolveForfeitBattle(supabase, {
        battleId: battle_id,
        winnerId,
        loserId: userId,
        mode: claim.mode ?? 'ranked',
        isBot: claim.is_bot,
        ratingGated,
        scorePayload,
        // Unlike the timeout path, promote straight to 'completed'. Getting
        // the character unlocked for editing immediately is a large part of
        // what the player just paid for.
        promoteToCompleted: true,
        winnerRating: Number(claim.winner_rating),
        winnerRatingDeviation: Number(claim.winner_rating_deviation),
        winnerRatingVolatility: Number(claim.winner_rating_volatility),
        loserRating: Number(claim.loser_rating),
        loserRatingDeviation: Number(claim.loser_rating_deviation),
        loserRatingVolatility: Number(claim.loser_rating_volatility),
      });

      if (!resolved) {
        // Something else resolved the battle between the claim and here. The
        // player still got what they asked for, but they should not pay for an
        // exit somebody else performed.
        await refundLeave(supabase, userId, charged, claim.transaction_id, battle_id);
        return successResponse({
          success: true,
          action: 'already_terminal',
          credits_charged: 0,
        });
      }
    } catch (resolveErr) {
      console.error('Forfeit resolution failed:', resolveErr);
      // Give the money back AND put the battle back, in that order: the battle
      // is the thing the player would notice losing, and restoring it cannot
      // fail for lack of credits. Left in 'resolving' it would be unplayable
      // and unleavable.
      await refundLeave(supabase, userId, charged, claim.transaction_id, battle_id);
      await restoreBattle(supabase, battle_id, claim);
      return errorResponse('Could not leave the battle', 500);
    }

    return successResponse({
      success: true,
      action: 'forfeited',
      winner_id: winnerId,
      credits_charged: charged,
    });
  } catch (error) {
    console.error('leave-battle error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to leave battle',
      500,
    );
  }
});

/**
 * Returns the toll when the exit did not happen.
 *
 * Keyed on the wallet transaction id so a retried failure cannot refund twice.
 * A failure here is logged loudly because nothing else will say so — the player
 * is simply short a credit.
 */
async function refundLeave(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  credits: number,
  walletTxId: string | null | undefined,
  battleId: string,
): Promise<void> {
  if (credits <= 0 || !walletTxId) return;
  const { error } = await supabase.rpc('grant_credits', {
    p_profile_id: userId,
    p_amount: credits,
    p_reason: 'leave_battle_refund:resolve_failed',
    p_idempotency_key: `refund_${walletTxId}`,
    p_battle_id: battleId,
    p_purchase_id: null,
    p_metadata: { feature: 'leave_battle' },
  });
  if (error) {
    console.error('CREDIT REFUND FAILED', { userId, credits, walletTxId, error });
  }
}

/**
 * Puts a battle back the way the claim found it after a failed resolve.
 *
 * `previous_status` comes back from the claim precisely so this is possible;
 * the bo3 round is reopened for the same reason, since the claim canceled it.
 */
async function restoreBattle(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  battleId: string,
  claim: LeaveClaim,
): Promise<void> {
  const { error } = await supabase
    .from('battles')
    .update({ status: claim.previous_status })
    .eq('id', battleId)
    .eq('status', 'resolving');
  if (error) {
    console.error('BATTLE RESTORE FAILED', { battleId, error });
    return;
  }

  if (claim.format === 'bo3') {
    const { error: roundErr } = await supabase
      .from('battle_rounds')
      .update({ status: 'waiting_for_prompts', resolved_at: null })
      .eq('battle_id', battleId)
      .eq('round_number', claim.current_round)
      .eq('status', 'canceled');
    if (roundErr) {
      console.error('ROUND RESTORE FAILED', { battleId, error: roundErr });
    }
  }
}
