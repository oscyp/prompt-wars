// Round Resolve Edge Function (Bo3, Phase 2)
//
// Triggered by either submit-prompt (when both players lock for a round) or
// expire-battles (when round timeout passes with one side locked). Service-role
// only; clients cannot invoke this directly.
//
// Responsibilities:
//   1. Idempotently claim the round (status: waiting_for_prompts -> resolving).
//   2. Run the existing AI judge pipeline scoped to THIS round's prompts.
//   3. Apply move-type modifier AND stat modifier (HARD CAP ±5% stat, ±20% combined).
//   4. Persist scores, damage, HP-after, judge payload onto battle_rounds.
//   5. Update battles.player_*_hp / player_*_rounds_won atomically.
//   6. Enqueue Tier 0 reveal (always). Tier 1 enqueue is gated by entitlements (TODO).
//   7. Invoke battle-advance to either spawn next round or complete the match.
//
// Single-format battles continue to use resolve-battle and never reach this fn.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getSupabaseSecretKey,
  hasSupabaseSecretAuthorization,
  successResponse,
} from "../_shared/utils.ts";
import { assertNoMonetizationDataInScoring } from "../_shared/anti-p2w.ts";
import {
  JUDGE_PROMPT_VERSION,
  MOVE_TYPE_POINTS_WIN,
  moveTypePoints,
  runJudgePipeline,
} from "../_shared/judge.ts";
import { createJudgeProvider } from "../_shared/providers.ts";
import { MoveType } from "../_shared/types.ts";
import {
  composeRevealPayload,
  writeRoundRevealPayload,
} from "../_shared/compose-reveal-payload.ts";

interface RoundResolveRequest {
  battle_id: string;
  round_number?: number; // defaults to battles.current_round
  forfeit_profile_id?: string; // when called by expire-battles for single-sided lock
}

// Move-type points come from _shared/judge.ts so the Bo3 and legacy
// single-format paths cannot drift apart.

const STAT_MOD_CAP = 0.05;
const COMBINED_MOD_CAP = 0.20;

/**
 * Floor for the combined cap, in aggregate points.
 *
 * The §7.7 combined cap is ±20% of the base aggregate. Now that move-type is an
 * absolute ±0.9/-0.6 rather than a fraction, a very low-scoring round (base ~5,
 * so a 20% cap of 1.0) could trip the guard on a structurally legal modifier.
 * The floor keeps the cap meaningful at normal scores (base 40 -> ±8) without
 * false-positives on floor-scraping rounds.
 */
const COMBINED_POINTS_FLOOR = 2.0;

const KO_SCORE_GAP_THRESHOLD = 7;

interface StatsSnapshot {
  strength: number;
  stamina: number;
  agility: number;
  focus: number;
}

/**
 * Compute the stat modifier for a player given their snapshot and opponent
 * snapshot. Bounded to ±5% by formula; hard-capped server-side anyway.
 *
 * Formula (per concept §7.7):
 *   raw = (strength_delta / 20) + (focus_delta / 40)
 *   stat_mod = clamp(raw, -0.05, +0.05)
 *
 * Each 1-stat point gap in Strength contributes 0.5% (max 4.5% from a 10v1
 * gap); Focus contributes 0.25% (and dampens variance).
 */
function computeStatModifier(
  self: StatsSnapshot,
  opp: StatsSnapshot,
): number {
  const raw = (self.strength - opp.strength) / 20 +
    (self.focus - opp.focus) / 40;
  return Math.max(-STAT_MOD_CAP, Math.min(STAT_MOD_CAP, raw));
}

/**
 * Deterministic damage: 12 + gap*2.2 + (strength-5)*1.5, clamped 8..60.
 *
 * The previous formula was `gap * (8 + strength/2)` clamped to 40. Because
 * DRAW_EPSILON is 3.0, every non-draw round had a gap of at least 3, and at
 * default strength any gap above ~3.8 already hit the clamp -- so damage was
 * effectively the constant 40. With HP_max = 60 + stamina*8 (100 at default
 * stamina) and a match ending at two round wins, a player could absorb at most
 * 80 damage. KO (hp <= 0) was therefore mathematically unreachable at stamina
 * >= 5, and the "lower HP loses" all-draw tiebreaker could never discriminate
 * because both players always sat on identical HP.
 *
 * Under the new curve damage rises continuously with the score gap:
 *
 *   gap  3 (narrow)   -> 19    two of them = 38   -> survivable at any stamina
 *   gap 10 (clear)    -> 34    two of them = 68   -> KO only at stamina 1 (68 HP)
 *   gap 20 (blowout)  -> 56    two of them = 112  -> KO at stamina 5 (100 HP),
 *                                                    survivable at stamina 10 (140)
 *
 * So stamina buys real KO resistance, a genuine two-round blowout can finish a
 * match, an even series cannot, and HP almost never ties -- which makes the
 * tiebreaker functional again.
 *
 * HP_max is unchanged, so the battles.player_*_hp_max CHECK constraint (floor
 * 68, migration 20260525170000) still holds and needs no migration.
 */
function computeDamage(scoreGap: number, winnerStrength: number): number {
  const raw = 12 + Math.abs(scoreGap) * 2.2 + (winnerStrength - 5) * 1.5;
  return Math.max(8, Math.min(60, Math.round(raw)));
}

function readStatsSnapshot(raw: unknown): StatsSnapshot {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof obj[k] === "number" ? (obj[k] as number) : d;
  return {
    strength: num("strength", 5),
    stamina: num("stamina", 5),
    agility: num("agility", 5),
    focus: num("focus", 5),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Service-role only.
  if (
    !hasSupabaseSecretAuthorization(
      req.headers.get("Authorization"),
      req.headers.get("apikey"),
    )
  ) {
    return errorResponse("Service role required", 403);
  }

  try {
    const body: RoundResolveRequest = await req.json();
    const { battle_id, forfeit_profile_id } = body;

    if (!battle_id) {
      return errorResponse("battle_id required");
    }

    const supabase = createServiceClient();

    // Load the battle (with stat snapshots and HP).
    const { data: battle, error: battleErr } = await supabase
      .from("battles")
      .select(
        `
        id, format, status, mode,
        player_one_id, player_two_id, is_player_two_bot, bot_persona_id,
        theme, current_round, best_of,
        player_one_hp, player_two_hp,
        player_one_hp_max, player_two_hp_max,
        player_one_rounds_won, player_two_rounds_won,
        player_one_stats_snapshot, player_two_stats_snapshot
      `,
      )
      .eq("id", battle_id)
      .single();

    if (battleErr || !battle) {
      return errorResponse("Battle not found", 404);
    }

    if (battle.format !== "bo3") {
      return errorResponse("round-resolve only applies to format=bo3", 400);
    }

    const roundNumber: number = body.round_number ?? battle.current_round ?? 1;

    // Idempotent claim: waiting_for_prompts -> resolving
    const { data: claimedRound, error: claimErr } = await supabase
      .from("battle_rounds")
      .update({ status: "resolving", updated_at: new Date().toISOString() })
      .eq("battle_id", battle_id)
      .eq("round_number", roundNumber)
      .eq("status", "waiting_for_prompts")
      .select("*")
      .maybeSingle();

    if (claimErr) {
      return errorResponse(
        `Failed to claim round: ${claimErr.message}`,
        500,
      );
    }
    if (!claimedRound) {
      // Already resolved or wrong state; nothing to do (idempotent).
      return successResponse({
        battle_id,
        round_number: roundNumber,
        already_resolved: true,
      });
    }

    // Load prompts for THIS round only.
    const { data: prompts, error: promptsErr } = await supabase
      .from("battle_prompts")
      .select("*")
      .eq("battle_id", battle_id)
      .eq("round_number", roundNumber);

    if (promptsErr) {
      return errorResponse("Failed to fetch round prompts", 500);
    }

    const p1Row = prompts?.find((p) => p.profile_id === battle.player_one_id);
    const p2Row = battle.is_player_two_bot
      ? null
      : prompts?.find((p) => p.profile_id === battle.player_two_id);

    // Handle forfeits — if one side is missing and a forfeit was declared.
    const p1Forfeit = forfeit_profile_id === battle.player_one_id ||
      (!p1Row && !!p2Row);
    const p2Forfeit = forfeit_profile_id === battle.player_two_id ||
      (!battle.is_player_two_bot && !!p1Row && !p2Row);

    if (!battle.is_player_two_bot && !p1Row && !p2Row) {
      // Both forfeited — mark round expired, advance.
      await supabase
        .from("battle_rounds")
        .update({
          status: "expired",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", claimedRound.id);
      await invokeBattleAdvance(battle_id);
      return successResponse({
        battle_id,
        round_number: roundNumber,
        expired: true,
      });
    }

    // Resolve prompt text bodies.
    const promptText = async (
      row: typeof p1Row | null | undefined,
    ): Promise<{ text: string; moveType: MoveType; wordCount: number }> => {
      if (!row) return { text: "", moveType: "attack", wordCount: 0 };
      let text = row.custom_prompt_text ?? "";
      if (!text && row.prompt_template_id) {
        const { data: tpl } = await supabase
          .from("prompt_templates")
          .select("body")
          .eq("id", row.prompt_template_id)
          .single();
        text = tpl?.body ?? "";
      }
      return {
        text,
        moveType: row.move_type as MoveType,
        wordCount: row.word_count || text.split(/\s+/).filter(Boolean).length,
      };
    };

    const p1 = await promptText(p1Row);
    let p2 = await promptText(p2Row);

    // Bot opponent: synthesize prompt from bot_prompt_library.
    if (battle.is_player_two_bot && !p2Row && battle.bot_persona_id) {
      const { data: botPrompts } = await supabase
        .from("bot_prompt_library")
        .select("prompt_text, move_type")
        .eq("bot_persona_id", battle.bot_persona_id);
      if (botPrompts && botPrompts.length > 0) {
        const pick = botPrompts[Math.floor(Math.random() * botPrompts.length)];
        p2 = {
          text: pick.prompt_text,
          moveType: pick.move_type as MoveType,
          wordCount: pick.prompt_text.split(/\s+/).filter(Boolean).length,
        };
      }
    }

    // ---- Run judge pipeline (existing implementation; per-round) ----
    //
    // ANTI-PAY-TO-WIN INVARIANT (do not relax without monetization+safety review):
    // `runJudgePipeline` is invoked with ONLY: prompt text, move types, word
    // counts, theme, and frozen prompt version. No subscription, cosmetic, or
    // purchase data flows into the judge. Stats and HP enter scoring AFTER the
    // judge returns, via the bounded `computeStatModifier` (±5% hard cap) and
    // `moveTypeModifier` paths. The runtime assertion below fails loudly if
    // future edits accidentally introduce monetization inputs to scoring.
    const judgeProvider = createJudgeProvider();
    let judgeResult: Awaited<ReturnType<typeof runJudgePipeline>> | null = null;

    // Runtime guard: the only fields permitted to influence scoring are
    // prompts, move types, word counts, theme, stats snapshots, and HP.
    // Any new field on `battle` must be explicitly whitelisted here.
    assertNoMonetizationDataInScoring({
      p1Text: p1.text,
      p2Text: p2.text,
      p1Move: p1.moveType,
      p2Move: p2.moveType,
      p1Wc: p1.wordCount,
      p2Wc: p2.wordCount,
      theme: battle.theme,
      p1Stats: battle.player_one_stats_snapshot,
      p2Stats: battle.player_two_stats_snapshot,
      p1Hp: battle.player_one_hp,
      p2Hp: battle.player_two_hp,
    });

    if (p1.text && p2.text && !p1Forfeit && !p2Forfeit) {
      judgeResult = await runJudgePipeline(
        judgeProvider,
        p1.text,
        p2.text,
        p1.moveType,
        p2.moveType,
        p1.wordCount,
        p2.wordCount,
        battle.theme,
        JUDGE_PROMPT_VERSION,
      );
    }

    // ---- Compute final scores with move-type + stat modifier (capped) ----
    const p1Stats = readStatsSnapshot(battle.player_one_stats_snapshot);
    const p2Stats = readStatsSnapshot(battle.player_two_stats_snapshot);

    const aggregate = (s: {
      clarity: number;
      originality: number;
      specificity: number;
      theme_fit: number;
      archetype_fit: number;
      dramatic_potential: number;
    }) =>
      s.clarity + s.originality + s.specificity +
      s.theme_fit + s.archetype_fit + s.dramatic_potential;

    // Move-type is now an absolute aggregate-point adjustment; the stat
    // modifier stays fractional (±5% of base) per §7.7 and is materialized into
    // points at application time so the two can be summed and capped together.
    const p1MovePoints = moveTypePoints(p1.moveType, p2.moveType);
    const p2MovePoints = moveTypePoints(p2.moveType, p1.moveType);
    const p1StatMod = computeStatModifier(p1Stats, p2Stats);
    const p2StatMod = computeStatModifier(p2Stats, p1Stats);

    // HARD CAP enforcement — raise rather than silently clamp.
    if (
      Math.abs(p1StatMod) > STAT_MOD_CAP + 1e-9 ||
      Math.abs(p2StatMod) > STAT_MOD_CAP + 1e-9
    ) {
      return errorResponse("stat_modifier exceeded ±5% cap", 500);
    }
    if (
      Math.abs(p1MovePoints) > MOVE_TYPE_POINTS_WIN + 1e-9 ||
      Math.abs(p2MovePoints) > MOVE_TYPE_POINTS_WIN + 1e-9
    ) {
      return errorResponse("move_type modifier exceeded its point bound", 500);
    }

    let p1Score = 0;
    let p2Score = 0;
    let scoreGap = 0;
    let roundWinnerId: string | null = null;
    let isDraw = false;

    if (judgeResult) {
      const p1Base = aggregate(judgeResult.player_one_normalized_scores);
      const p2Base = aggregate(judgeResult.player_two_normalized_scores);

      const p1CombinedPoints = p1Base * p1StatMod + p1MovePoints;
      const p2CombinedPoints = p2Base * p2StatMod + p2MovePoints;

      // §7.7 caps the combined modifier at ±20% of the base, with a small
      // absolute floor so floor-scraping rounds cannot false-trip the guard.
      const p1Cap = Math.max(COMBINED_MOD_CAP * p1Base, COMBINED_POINTS_FLOOR);
      const p2Cap = Math.max(COMBINED_MOD_CAP * p2Base, COMBINED_POINTS_FLOOR);
      if (
        Math.abs(p1CombinedPoints) > p1Cap + 1e-9 ||
        Math.abs(p2CombinedPoints) > p2Cap + 1e-9
      ) {
        return errorResponse("combined modifier exceeded ±20% cap", 500);
      }

      p1Score = Math.max(0, p1Base + p1CombinedPoints);
      p2Score = Math.max(0, p2Base + p2CombinedPoints);
      scoreGap = Math.abs(p1Score - p2Score);

      const DRAW_EPSILON = 3.0;
      if (scoreGap < DRAW_EPSILON) {
        isDraw = true;
      } else {
        roundWinnerId = p1Score > p2Score
          ? battle.player_one_id
          : battle.player_two_id;
      }
    } else {
      // Forfeit path — non-forfeiting side wins by walkover.
      if (p1Forfeit && !p2Forfeit) {
        roundWinnerId = battle.player_two_id;
        scoreGap = KO_SCORE_GAP_THRESHOLD;
      } else if (p2Forfeit && !p1Forfeit) {
        roundWinnerId = battle.player_one_id;
        scoreGap = KO_SCORE_GAP_THRESHOLD;
      }
    }

    // ---- Damage and HP-after ----
    let p1Damage = 0;
    let p2Damage = 0;
    const p1HpBefore = battle.player_one_hp ?? battle.player_one_hp_max ?? 100;
    const p2HpBefore = battle.player_two_hp ?? battle.player_two_hp_max ?? 100;

    if (!isDraw && roundWinnerId) {
      if (roundWinnerId === battle.player_one_id) {
        p2Damage = computeDamage(scoreGap, p1Stats.strength);
      } else {
        p1Damage = computeDamage(scoreGap, p2Stats.strength);
      }
    }
    const p1HpAfter = Math.max(0, p1HpBefore - p1Damage);
    const p2HpAfter = Math.max(0, p2HpBefore - p2Damage);

    const isKo = !isDraw &&
      roundWinnerId !== null &&
      scoreGap >= KO_SCORE_GAP_THRESHOLD &&
      ((roundWinnerId === battle.player_one_id && p2HpAfter <= 0) ||
        (roundWinnerId === battle.player_two_id && p1HpAfter <= 0));

    // ---- Persist judge_runs row (per-round audit) ----
    if (judgeResult) {
      await supabase.from("judge_runs").insert({
        battle_id,
        judge_prompt_version: JUDGE_PROMPT_VERSION,
        model_id: judgeProvider.getModelId(),
        seed: Math.floor(Math.random() * 10000),
        player_one_raw_scores: judgeResult.player_one_raw_scores,
        player_two_raw_scores: judgeResult.player_two_raw_scores,
        player_one_normalized_scores: judgeResult.player_one_normalized_scores,
        player_two_normalized_scores: judgeResult.player_two_normalized_scores,
        winner_profile_id: roundWinnerId,
        is_draw: isDraw,
        explanation: judgeResult.explanation,
        aggregate_score_diff: scoreGap,
        run_sequence: roundNumber,
        // Measured spend for this round's 2-3 judge calls. NULL for the mock.
        provider_cost_usd: judgeResult.total_cost_usd ?? null,
      });
    }

    // ---- Update battle_rounds with full result ----
    const judgePayload = judgeResult
      ? {
        player_one_raw_scores: judgeResult.player_one_raw_scores,
        player_two_raw_scores: judgeResult.player_two_raw_scores,
        player_one_normalized_scores: judgeResult.player_one_normalized_scores,
        player_two_normalized_scores: judgeResult.player_two_normalized_scores,
        explanation: judgeResult.explanation,
        move_type_matchup: {
          player_one: p1.moveType,
          player_two: p2.moveType,
        },
        forfeit_profile_id: forfeit_profile_id ?? null,
      }
      : { forfeit_profile_id: forfeit_profile_id ?? null };

    const { error: roundUpdateErr } = await supabase
      .from("battle_rounds")
      .update({
        status: "result_ready",
        round_winner_id: roundWinnerId,
        is_draw: isDraw,
        player_one_score: p1Score,
        player_two_score: p2Score,
        score_gap: scoreGap,
        player_one_damage: p1Damage,
        player_two_damage: p2Damage,
        player_one_hp_after: p1HpAfter,
        player_two_hp_after: p2HpAfter,
        is_ko: isKo,
        judge_payload: judgePayload,
        judge_prompt_version: JUDGE_PROMPT_VERSION,
        judge_model_id: judgeProvider.getModelId(),
        stat_modifier_player_one: p1StatMod,
        stat_modifier_player_two: p2StatMod,
        // Absolute aggregate points, not a fraction (migration 20260822170000).
        move_type_modifier_player_one: p1MovePoints,
        move_type_modifier_player_two: p2MovePoints,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", claimedRound.id);

    if (roundUpdateErr) {
      return errorResponse(
        `Failed to write round result: ${roundUpdateErr.message}`,
        500,
      );
    }

    // ---- Update battle HP & round-win tally atomically ----
    const newP1Wins = (battle.player_one_rounds_won ?? 0) +
      (roundWinnerId === battle.player_one_id ? 1 : 0);
    const newP2Wins = (battle.player_two_rounds_won ?? 0) +
      (roundWinnerId === battle.player_two_id ? 1 : 0);

    await supabase
      .from("battles")
      .update({
        player_one_hp: p1HpAfter,
        player_two_hp: p2HpAfter,
        player_one_rounds_won: newP1Wins,
        player_two_rounds_won: newP2Wins,
        updated_at: new Date().toISOString(),
      })
      .eq("id", battle_id);

    // ---- Compose Tier 0 reveal SYNCHRONOUSLY (always present) ----
    // The base RevealPayloadV1 is produced here so the reveal is guaranteed the
    // moment the round reaches result_ready. Video/audio/portrait-URL fields are
    // additive + nullable; Tier 1 never gates this. We write to the client-read
    // home (battles.tier0_reveal_payload, overwritten per round so the existing
    // client read works TODAY against the current schema) plus a durable,
    // NON-FATAL per-round copy (battle_rounds.reveal_payload) that no-ops until
    // its migration is applied. Failure NEVER blocks round completion.
    try {
      const revealPayload = await composeRevealPayload(supabase, {
        battleId: battle_id,
        battleRoundId: claimedRound.id,
        roundNumber,
      });
      const { error: battleRevealErr } = await supabase
        .from("battles")
        .update({ tier0_reveal_payload: revealPayload })
        .eq("id", battle_id);
      if (battleRevealErr) {
        console.error(
          "Failed to write reveal to battles (non-blocking):",
          battleRevealErr,
        );
      }
      await writeRoundRevealPayload(supabase, claimedRound.id, revealPayload);
    } catch (revealErr) {
      console.error(
        "Tier 0 reveal composition failed (non-blocking):",
        revealErr,
      );
    }

    // ---- Decide next round / completion ----
    await invokeBattleAdvance(battle_id);

    return successResponse({
      battle_id,
      round_number: roundNumber,
      round_winner_id: roundWinnerId,
      is_draw: isDraw,
      is_ko: isKo,
      score_gap: scoreGap,
      player_one_hp_after: p1HpAfter,
      player_two_hp_after: p2HpAfter,
    });
  } catch (error) {
    console.error("round-resolve error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Internal error",
      500,
    );
  }
});

async function invokeBattleAdvance(battleId: string): Promise<void> {
  await invokeFunctionAsync("battle-advance", { battle_id: battleId });
}

async function invokeFunctionAsync(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) return;

  const url = `${supabaseUrl}/functions/v1/${fn}`;
  const task = (async () => {
    try {
      const res = await fetch(url, {
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
    } catch (err) {
      console.error(`Invoke ${fn} threw:`, err);
    }
  })();

  // @ts-ignore EdgeRuntime not declared in Deno types
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  } else {
    await task;
  }
}
