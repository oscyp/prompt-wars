// Pure decisions behind leaving a battle.
//
// Split out from the handler so they can be tested: the Deno suite covers
// `_shared/` modules only, and the two things most worth pinning here — that a
// forfeit payload names the winner correctly, and that no trace of the credit
// charge reaches anything the judge can see — are pure functions over data.

export const LEAVABLE_STATUSES = [
  "created",
  "matched",
  "waiting_for_prompts",
] as const;

export const TERMINAL_BATTLE_STATUSES = [
  "completed",
  "expired",
  "canceled",
  "moderation_failed",
  "generation_failed",
] as const;

export type LeaveOutcome = "cancel" | "forfeit";

export interface LeaveContext {
  mode: string;
  isPlayerTwoBot: boolean;
  playerTwoId: string | null;
}

/**
 * Whether leaving ends the battle as a plain cancellation or as a forfeit.
 *
 * Only a matched, human, ranked battle has an opponent whose record is worth
 * adjusting. Everything else — bots, unranked modes, and battles nobody was
 * ever matched into — is simply canceled, with no winner and no stats.
 */
export function leaveOutcomeFor(ctx: LeaveContext): LeaveOutcome {
  if (ctx.mode !== "ranked") return "cancel";
  if (ctx.isPlayerTwoBot) return "cancel";
  if (!ctx.playerTwoId) return "cancel";
  return "forfeit";
}

export interface LeaveScorePayloadArgs {
  leaverId: string;
  format: string;
  /** Bo3 only; omitted from a single-format payload. */
  currentRound?: number | null;
  playerOneRoundsWon?: number | null;
  playerTwoRoundsWon?: number | null;
  /** Set when a §7.8 gate withheld the rating change. */
  ratingGated?: string | null;
}

/**
 * The `battles.score_payload` for a voluntary leave.
 *
 * Keyed `resolution`, not `outcome`. Both spellings existed: expire-battles
 * wrote `resolution` and leave-battle wrote `outcome`, and only the former is
 * read by compose-reveal-payload — so a forfeit through the leave path
 * produced a reveal that could not describe itself. One spelling now, pinned
 * by a test so it cannot drift back.
 *
 * `explanation` is written from the WINNER's point of view, matching the
 * existing timeout-forfeit string, because the reveal is what the winner reads.
 *
 * Contains nothing about credits, wallets, or prices — see
 * assertNoMonetizationDataInScoring. The only record that the exit was paid for
 * is the wallet_transactions row.
 */
export function buildLeaveScorePayload(
  args: LeaveScorePayloadArgs,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    resolution: "forfeit",
    reason: "player_left",
    forfeited_profile_id: args.leaverId,
    explanation: "Win by forfeit — your opponent left the battle.",
  };

  if (args.format === "bo3") {
    payload.format = "bo3";
    payload.rounds_won = {
      player_one: args.playerOneRoundsWon ?? 0,
      player_two: args.playerTwoRoundsWon ?? 0,
    };
    payload.abandoned_round = args.currentRound ?? 1;
  }

  if (args.ratingGated) {
    payload.rating_gated = args.ratingGated;
  }

  return payload;
}

/**
 * The wallet idempotency key for a leave.
 *
 * Deliberately carries no round number, timestamp or nonce: a battle can be
 * left exactly once by a given player, because leaving makes it terminal. That
 * makes (battle, player) the natural key, and it is what stops a double-tap
 * from being charged twice even when both taps arrive before either commits.
 *
 * Server-generated. Unlike generate-move-suggestions, the client must never
 * supply this — a client-chosen key would let a caller charge itself twice or
 * replay somebody else's.
 */
export function leaveIdempotencyKey(
  battleId: string,
  profileId: string,
): string {
  return `leave_battle_${battleId}_${profileId}`;
}
