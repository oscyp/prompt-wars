// Shared forfeit resolution.
//
// A forfeit ends a battle without the judge ever running: someone missed a
// deadline, or someone chose to walk out. Either way the winner's record,
// streak, rivals row, Glicko rating, quest progress, push notification and
// Tier 0 reveal all have to happen exactly as they would after a scored
// battle — which means going through `resolve_battle`, not around it.
//
// This lived inline in expire-battles as `resolveForfeit`. It moved here when
// leave-battle became the second caller: the alternative was two copies of the
// same six-step sequence, and the copy that already existed in leave-battle
// (a hand-rolled read-modify-write over `profiles`) had silently drifted into
// applying no rating, no rivals row, no rewards and no push at all.
//
// PRECONDITION: the battle is already in `resolving`. `resolve_battle`'s
// idempotency guard is `WHERE id = ... AND status = 'resolving'` and it returns
// FALSE against anything else, so the caller must have claimed it first.

import { computeRatingDeltas } from './glicko2.ts';
import { composeRevealPayload } from './compose-reveal-payload.ts';
import { notifyBattleResult } from './push.ts';

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export interface ForfeitRatings {
  winnerRating: number;
  winnerRatingDeviation: number;
  winnerRatingVolatility: number;
  loserRating: number;
  loserRatingDeviation: number;
  loserRatingVolatility: number;
}

export interface ResolveForfeitArgs extends ForfeitRatings {
  battleId: string;
  winnerId: string;
  loserId: string;
  mode: string;
  /** Bot battles never move rating, matching resolve_battle's own guard. */
  isBot?: boolean;
  /** Written verbatim to `battles.score_payload`. */
  scorePayload: Record<string, unknown>;
  /**
   * Withhold the rating change while still recording the result. Used by the
   * §7.8 gates; the reason is stamped into `score_payload.rating_gated` by the
   * caller, not here, because only the caller knows which gate fired.
   */
  ratingGated?: boolean;
  /**
   * Promote `result_ready` to `completed` once resolved.
   *
   * `resolve_battle` stops at `result_ready`, and normally `battle-advance`
   * does the promotion. Timeout forfeits have no such follow-up, so they sit at
   * `result_ready` forever — which both `FINAL_BATTLE_STATUSES` and
   * `assertNoActiveBattleForCharacter` read as "still playing", leaving the
   * character locked for editing. A player who just paid to leave must get
   * their character back immediately, so leave-battle passes true.
   */
  promoteToCompleted?: boolean;
}

/**
 * Resolves a forfeited battle through the standard path.
 *
 * Throws only if `resolve_battle` itself fails — everything after it (rewards,
 * push, reveal) is best-effort and logged, because the battle is already
 * correctly decided by then and failing the request would not undo it.
 *
 * @returns whether `resolve_battle` actually claimed the battle. FALSE means
 * something else resolved it first; the caller may need to undo a charge.
 */
export async function resolveForfeitBattle(
  supabase: ServiceClient,
  args: ResolveForfeitArgs,
): Promise<boolean> {
  let ratingDeltaPayload: Record<string, unknown> | null = null;

  if (args.mode === 'ranked' && !args.isBot && !args.ratingGated) {
    const deltas = computeRatingDeltas(
      Number(args.winnerRating),
      Number(args.winnerRatingDeviation),
      Number(args.winnerRatingVolatility),
      Number(args.loserRating),
      Number(args.loserRatingDeviation),
      Number(args.loserRatingVolatility),
      true, // winner won
      false, // not a draw
    );
    ratingDeltaPayload = {
      [args.winnerId]: deltas.playerOne,
      [args.loserId]: deltas.playerTwo,
    };
  }

  const { data: resolved, error: resolveErr } = await supabase.rpc(
    'resolve_battle',
    {
      p_battle_id: args.battleId,
      p_winner_id: args.winnerId,
      p_is_draw: false,
      p_score_payload: args.scorePayload,
      p_rating_delta_payload: ratingDeltaPayload,
      p_judge_prompt_version: 'forfeit-v1',
      p_judge_model_id: 'forfeit',
      p_judge_seed: 0,
    },
  );
  if (resolveErr) {
    throw new Error(`resolve_battle failed: ${resolveErr.message}`);
  }

  // FALSE means the status guard did not match -- someone else resolved it
  // between the claim and here. Report it rather than pretending success: the
  // caller may be holding a charge that now has to come back.
  if (resolved === false) {
    return false;
  }

  if (args.promoteToCompleted) {
    // Guarded on result_ready exactly as battle-advance does, so a concurrent
    // promotion cannot be clobbered.
    const { error: promoteErr } = await supabase
      .from('battles')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', args.battleId)
      .eq('status', 'result_ready');
    if (promoteErr) {
      console.error('Forfeit promotion to completed failed:', promoteErr);
    }
  }

  // Daily-meta rewards, must-send result push, and Tier 0 reveal follow the
  // same non-blocking contract as resolve-battle / battle-advance.
  try {
    const { error: rewardsError } = await supabase.rpc(
      'apply_post_battle_rewards',
      { p_battle_id: args.battleId },
    );
    if (rewardsError) {
      console.error(
        'apply_post_battle_rewards error (non-blocking):',
        rewardsError,
      );
    }
  } catch (rewardsErr) {
    console.error('Post-battle rewards failed (non-blocking):', rewardsErr);
  }

  notifyBattleResult(supabase, args.battleId);

  try {
    const revealPayload = await composeRevealPayload(supabase, {
      battleId: args.battleId,
    });
    const { error: revealError } = await supabase
      .from('battles')
      .update({ tier0_reveal_payload: revealPayload })
      .eq('id', args.battleId);
    if (revealError) {
      console.error(
        'Failed to store Tier 0 reveal (non-blocking):',
        revealError,
      );
    }
  } catch (tier0Error) {
    console.error(
      'Tier 0 reveal composition failed (non-blocking):',
      tier0Error,
    );
  }

  return true;
}
