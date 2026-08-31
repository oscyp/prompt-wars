// Expire Battles Cron Function
// Runs periodically to:
//   1. Expire single-format battles where neither side locked (DB function).
//   2. Forfeit single-format battles where exactly one side locked and the
//      other missed the deadline (§7.5 auto-forfeit): claim via
//      claim_forfeit_timeout_battles, then resolve through resolve_battle so
//      stats / streaks / rivals / ranked Glicko-2 flow the standard path.
//   3. For Bo3 battles: handle per-round timeouts. If one side locked, forfeit
//      that round via round-resolve. If neither locked, mark the round expired
//      and the battle expired.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getSupabaseSecretKey,
  hasSupabaseSecretAuthorization,
  successResponse,
} from "../_shared/utils.ts";
import { computeRatingDeltas } from "../_shared/glicko2.ts";
import { composeRevealPayload } from "../_shared/compose-reveal-payload.ts";
import { notifyBattleResult } from "../_shared/push.ts";
import { resolveForfeitBattle } from "../_shared/resolve-forfeit.ts";

interface ForfeitClaimRow {
  battle_id: string;
  winner_id: string;
  loser_id: string;
  mode: string;
  winner_rating: number;
  winner_rating_deviation: number;
  winner_rating_volatility: number;
  loser_rating: number;
  loser_rating_deviation: number;
  loser_rating_volatility: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Service-role only. This function forfeits battles and moves ratings, and
  // had no in-function check at all -- unlike the ten other functions using
  // this helper. The scheduling migration's header already claimed "each
  // scheduled Edge Function enforces hasSupabaseSecretAuthorization()", which
  // was untrue for this one.
  if (
    !hasSupabaseSecretAuthorization(
      req.headers.get("Authorization"),
      req.headers.get("apikey"),
    )
  ) {
    return errorResponse("Service role required", 403);
  }

  try {
    const supabase = createServiceClient();

    // ---- Single-format path (unchanged) ----
    const { data: expiredCount, error: singleErr } = await supabase.rpc(
      "expire_timed_out_battles",
    );
    if (singleErr) {
      console.error("Single-format expire error:", singleErr);
    }

    // ---- Single-format forfeit path (§7.5 auto-forfeit on expire) ----
    let singleForfeited = 0;

    const { data: forfeitRows, error: forfeitErr } = await supabase.rpc(
      "claim_forfeit_timeout_battles",
    );
    if (forfeitErr) {
      console.error("Forfeit claim error:", forfeitErr);
    }

    for (const row of (forfeitRows ?? []) as ForfeitClaimRow[]) {
      try {
        await resolveForfeit(supabase, row);
        singleForfeited += 1;
      } catch (err) {
        console.error(
          `Failed to resolve forfeit for battle ${row.battle_id}:`,
          err,
        );
      }
    }

    // ---- Reclaim rounds abandoned mid-resolution ----
    // round-resolve claims a round into 'resolving' BEFORE calling the judge,
    // and nothing else sweeps that state -- so one Edge Function timeout used
    // to brick a battle permanently.
    let reclaimed = 0;
    let deadLettered = 0;
    try {
      const { data: reclaimedRounds, error: reclaimErr } = await supabase.rpc(
        "reclaim_stuck_rounds",
        { p_stale_minutes: 10, p_max_attempts: 3 },
      );
      if (reclaimErr) {
        console.error("reclaim_stuck_rounds failed:", reclaimErr);
      } else {
        for (const r of (reclaimedRounds ?? []) as {
          battle_id: string;
          round_number: number;
          dead_lettered: boolean;
        }[]) {
          if (r.dead_lettered) {
            deadLettered += 1;
            continue;
          }
          reclaimed += 1;
          // Hand it straight back to the resolver rather than waiting for the
          // next tick.
          try {
            await invokeFn("round-resolve", {
              battle_id: r.battle_id,
              round_number: r.round_number,
            });
          } catch (err) {
            console.error("Re-drive of reclaimed round failed:", err);
          }
        }
      }
    } catch (err) {
      console.error("reclaim sweep threw:", err);
    }

    // ---- Bo3 path: per-round deadlines ----
    let bo3Forfeited = 0;
    let bo3Expired = 0;

    const { data: timedOutRounds } = await supabase
      .from("battle_rounds")
      .select(
        `
        id, battle_id, round_number, status,
        player_one_locked_at, player_two_locked_at, lock_in_deadline,
        battles!inner(id, format, mode, player_one_id, player_two_id,
                      player_one_rounds_won, player_two_rounds_won,
                      is_player_two_bot, status)
      `,
      )
      .eq("status", "waiting_for_prompts")
      // ...and the PARENT battle must still be live. The join already selected
      // battles.status without ever filtering on it, so a battle that ended by
      // some other route -- a forfeit, a leave, a manual resolve -- kept its
      // open round in this sweep and got handed back to round-resolve long
      // after it was over.
      .eq("battles.status", "waiting_for_prompts")
      .lt("lock_in_deadline", new Date().toISOString())
      // Bounded: this ran unbounded with no ordering, so a backlog would have
      // grown the per-minute sweep without limit. Oldest deadline first so
      // nothing starves; the next tick picks up the remainder.
      .order("lock_in_deadline", { ascending: true })
      .limit(100);

    for (const row of timedOutRounds ?? []) {
      // Supabase typings render an embedded relation as an array; coerce to the
      // single row we know we get back from a !inner join on PK.
      const battlesField = (row as unknown as { battles: unknown }).battles;
      const b =
        (Array.isArray(battlesField) ? battlesField[0] : battlesField) as
          | {
            format: string;
            mode: string;
            player_one_id: string;
            player_two_id: string;
            player_one_rounds_won: number | null;
            player_two_rounds_won: number | null;
          }
          | undefined;
      if (!b || b.format !== "bo3") continue;

      const p1Locked = !!row.player_one_locked_at;
      const p2Locked = !!row.player_two_locked_at;

      if (!p1Locked && !p2Locked) {
        // Neither side showed up. If one of them is ahead on rounds won, the
        // series has a legitimate winner and voiding it would take away a win
        // they already earned -- §7.7 says a timeout forfeits THAT ROUND, not
        // the match. Only a genuinely level series (0-0 or 1-1) expires.
        const p1Won = b.player_one_rounds_won ?? 0;
        const p2Won = b.player_two_rounds_won ?? 0;

        if (p1Won !== p2Won) {
          const winnerId = p1Won > p2Won ? b.player_one_id : b.player_two_id;
          const loserId = p1Won > p2Won ? b.player_two_id : b.player_one_id;
          try {
            await awardSeriesOnDoubleNoShow(supabase, {
              battleId: row.battle_id,
              roundId: row.id,
              mode: b.mode,
              winnerId,
              loserId,
              roundsWon: `${p1Won}-${p2Won}`,
            });
            bo3Forfeited += 1;
          } catch (err) {
            console.error("Failed to award series on double no-show:", err);
          }
          continue;
        }

        // Level series → expire round and battle.
        await supabase
          .from("battle_rounds")
          .update({
            status: "expired",
            resolved_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await supabase
          .from("battles")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.battle_id);
        bo3Expired += 1;
        continue;
      }

      // One side locked → forfeit the other side via round-resolve.
      const forfeitId = p1Locked ? b.player_two_id : b.player_one_id;
      try {
        await invokeFn("round-resolve", {
          battle_id: row.battle_id,
          round_number: row.round_number,
          forfeit_profile_id: forfeitId,
        });
        bo3Forfeited += 1;
      } catch (err) {
        console.error("Failed to invoke round-resolve for forfeit:", err);
      }
    }

    return successResponse({
      reclaimed_rounds: reclaimed,
      dead_lettered_rounds: deadLettered,
      success: true,
      expired_count: expiredCount ?? 0,
      single_forfeited: singleForfeited,
      bo3_forfeited: bo3Forfeited,
      bo3_expired: bo3Expired,
    });
  } catch (error) {
    console.error("Expire battles error:", error);
    return successResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      500,
    );
  }
});

// Resolve a claimed single-format forfeit through the standard resolve_battle
// pipeline. The claim RPC already flipped the battle to 'resolving', which the
// RPC's idempotency guard requires. Rating deltas mirror battle-advance:
// ranked-only, winner treated as a straight win.
/**
 * Close out a Bo3 series where neither player locked in, but one of them is
 * ahead on rounds won.
 *
 * Previously this path voided the whole battle to 'expired' with no result, no
 * rating change and no reveal -- so a player leading 1-0 lost a round they had
 * already won. §7.7 is explicit that a lock-in timeout forfeits that round
 * only; the match continues unless the loss completes it. A double no-show at
 * 1-0 completes it in the leader's favour.
 *
 * Rating maths mirrors resolveForfeit(): ranked-only, winner treated as a
 * straight win. Ratings are read here rather than joined into the sweep query
 * because this is the rare path and the sweep runs every minute.
 */
async function awardSeriesOnDoubleNoShow(
  supabase: ReturnType<typeof createServiceClient>,
  args: {
    battleId: string;
    roundId: string;
    mode: string;
    winnerId: string;
    loserId: string;
    roundsWon: string;
  },
): Promise<void> {
  // Close the abandoned round first so it does not get swept again next tick.
  await supabase
    .from("battle_rounds")
    .update({ status: "expired", resolved_at: new Date().toISOString() })
    .eq("id", args.roundId);

  let ratingDeltaPayload: Record<string, unknown> | null = null;

  if (args.mode === "ranked") {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, rating, rating_deviation, rating_volatility")
      .in("id", [args.winnerId, args.loserId]);

    const winner = profiles?.find((p) => p.id === args.winnerId);
    const loser = profiles?.find((p) => p.id === args.loserId);

    if (winner && loser) {
      const deltas = computeRatingDeltas(
        Number(winner.rating),
        Number(winner.rating_deviation),
        Number(winner.rating_volatility),
        Number(loser.rating),
        Number(loser.rating_deviation),
        Number(loser.rating_volatility),
        true,
        false,
      );
      ratingDeltaPayload = {
        [args.winnerId]: deltas.playerOne,
        [args.loserId]: deltas.playerTwo,
      };
    }
  }

  const { error } = await supabase.rpc("resolve_battle", {
    p_battle_id: args.battleId,
    p_winner_id: args.winnerId,
    p_is_draw: false,
    p_score_payload: {
      resolution: "series_abandoned",
      reason: "double_no_show",
      rounds_won: args.roundsWon,
      explanation:
        "Neither player locked in before the deadline. The series was awarded " +
        "to the player leading on rounds won.",
    },
    p_rating_delta_payload: ratingDeltaPayload,
    p_judge_prompt_version: "forfeit-v1",
    p_judge_model_id: "forfeit",
    p_judge_seed: 0,
  });

  if (error) {
    throw new Error(`resolve_battle failed: ${error.message}`);
  }

  try {
    await supabase.rpc("apply_post_battle_rewards", {
      p_battle_id: args.battleId,
    });
  } catch (err) {
    console.error("apply_post_battle_rewards failed (non-blocking):", err);
  }

  notifyBattleResult(supabase, args.battleId);
}

async function resolveForfeit(
  supabase: ReturnType<typeof createServiceClient>,
  row: ForfeitClaimRow,
): Promise<void> {
  // Deliberately does NOT promote result_ready -> completed. That gap is real
  // (it leaves the character edit-locked) but it is pre-existing on this path
  // and fixing it here would change the status timeline for every timeout
  // forfeit at once; leave-battle opts in instead. See resolve-forfeit.ts.
  await resolveForfeitBattle(supabase, {
    battleId: row.battle_id,
    winnerId: row.winner_id,
    loserId: row.loser_id,
    mode: row.mode,
    winnerRating: Number(row.winner_rating),
    winnerRatingDeviation: Number(row.winner_rating_deviation),
    winnerRatingVolatility: Number(row.winner_rating_volatility),
    loserRating: Number(row.loser_rating),
    loserRatingDeviation: Number(row.loser_rating_deviation),
    loserRatingVolatility: Number(row.loser_rating_volatility),
    scorePayload: {
      resolution: "forfeit",
      reason: "opponent_timeout",
      forfeited_profile_id: row.loser_id,
      explanation:
        "Win by forfeit — the opponent did not lock in a prompt before the deadline.",
    },
  });
}

async function invokeFn(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing Supabase environment variables");
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: secretKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`Invoke ${fn} failed:`, await res.text());
  }
}
