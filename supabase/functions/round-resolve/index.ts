import { forfeitRoundPayload } from '../_shared/round-forfeit.ts';
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
} from '../_shared/utils.ts';
import { assertNoMonetizationDataInScoring } from '../_shared/anti-p2w.ts';
import {
  JUDGE_PROMPT_VERSION,
  aggregateScore,
  runJudgePipeline,
} from '../_shared/judge.ts';
import { resolveCombatRound } from '../_shared/combat.ts';
import { createJudgeProvider } from '../_shared/providers.ts';
import { MoveType } from '../_shared/types.ts';
import {
  composeRevealPayload,
  writeRoundRevealPayload,
} from '../_shared/compose-reveal-payload.ts';

interface RoundResolveRequest {
  battle_id: string;
  round_number?: number; // defaults to battles.current_round
  forfeit_profile_id?: string; // when called by expire-battles for single-sided lock
}

interface StatsSnapshot {
  strength: number;
  stamina: number;
  agility: number;
  focus: number;
}
function readStatsSnapshot(raw: unknown): StatsSnapshot {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof obj[k] === 'number' ? (obj[k] as number) : d;
  return {
    strength: num('strength', 5),
    stamina: num('stamina', 5),
    agility: num('agility', 5),
    focus: num('focus', 5),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Service-role only.
  if (
    !hasSupabaseSecretAuthorization(
      req.headers.get('Authorization'),
      req.headers.get('apikey'),
    )
  ) {
    return errorResponse('Service role required', 403);
  }

  try {
    const body: RoundResolveRequest = await req.json();
    const { battle_id, forfeit_profile_id } = body;

    if (!battle_id) {
      return errorResponse('battle_id required');
    }

    const supabase = createServiceClient();

    // Load the battle (with stat snapshots and HP).
    const { data: battle, error: battleErr } = await supabase
      .from('battles')
      .select(
        `
        id, format, status, mode, rules_version,
        player_one_id, player_two_id, is_player_two_bot, bot_persona_id,
        theme, current_round, best_of,
        player_one_hp, player_two_hp,
        player_one_hp_max, player_two_hp_max,
        player_one_rounds_won, player_two_rounds_won,
        player_one_stats_snapshot, player_two_stats_snapshot
      `,
      )
      .eq('id', battle_id)
      .single();

    if (battleErr || !battle) {
      return errorResponse('Battle not found', 404);
    }

    if (battle.format !== 'bo3') {
      return errorResponse('round-resolve only applies to format=bo3', 400);
    }

    const roundNumber: number = body.round_number ?? battle.current_round ?? 1;

    // Idempotent claim: waiting_for_prompts -> resolving
    const { data: claimedRows, error: claimErr } = await supabase.rpc(
      'claim_battle_round',
      {
        p_battle_id: battle_id,
        p_round_number: roundNumber,
      },
    );
    const claimedRound = Array.isArray(claimedRows)
      ? claimedRows[0]
      : claimedRows;

    if (claimErr) {
      return errorResponse(`Failed to claim round: ${claimErr.message}`, 500);
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
      .from('battle_prompts')
      .select('*')
      .eq('battle_id', battle_id)
      .eq('round_number', roundNumber)
      .eq('is_locked', true);

    if (promptsErr) {
      return errorResponse('Failed to fetch round prompts', 500);
    }

    const p1Row = prompts?.find((p) => p.profile_id === battle.player_one_id);
    const p2Row = battle.is_player_two_bot
      ? null
      : prompts?.find((p) => p.profile_id === battle.player_two_id);

    // Handle forfeits — if one side is missing and a forfeit was declared.
    const p1Forfeit =
      forfeit_profile_id === battle.player_one_id ||
      (!p1Row && (!!p2Row || battle.is_player_two_bot));
    const p2Forfeit =
      forfeit_profile_id === battle.player_two_id ||
      (!battle.is_player_two_bot && !!p1Row && !p2Row);

    if (!battle.is_player_two_bot && !p1Row && !p2Row) {
      // Both forfeited — mark round expired, advance.
      await supabase
        .from('battle_rounds')
        .update({
          status: 'expired',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', claimedRound.id);
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
      if (!row) return { text: '', moveType: 'attack', wordCount: 0 };
      let text = row.custom_prompt_text ?? '';
      if (!text && row.prompt_template_id) {
        const { data: tpl } = await supabase
          .from('prompt_templates')
          .select('body')
          .eq('id', row.prompt_template_id)
          .single();
        text = tpl?.body ?? '';
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
        .from('bot_prompt_library')
        .select('prompt_text, move_type')
        .eq('bot_persona_id', battle.bot_persona_id);
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

    const p1Stats = readStatsSnapshot(battle.player_one_stats_snapshot);
    const p2Stats = readStatsSnapshot(battle.player_two_stats_snapshot);
    const combat = resolveCombatRound({
      rulesVersion: battle.rules_version ?? 1,
      playerOne: p1Stats,
      playerTwo: p2Stats,
      playerOneBase: judgeResult
        ? aggregateScore(judgeResult.player_one_normalized_scores)
        : 0,
      playerTwoBase: judgeResult
        ? aggregateScore(judgeResult.player_two_normalized_scores)
        : 0,
      playerOneMove: p1.moveType,
      playerTwoMove: p2.moveType,
      playerOneHp: battle.player_one_hp ?? battle.player_one_hp_max ?? 100,
      playerTwoHp: battle.player_two_hp ?? battle.player_two_hp_max ?? 100,
      forfeitWinner:
        p1Forfeit && !p2Forfeit ? 2 : p2Forfeit && !p1Forfeit ? 1 : null,
    });
    const {
      playerOneScore: p1Score,
      playerTwoScore: p2Score,
      scoreGap,
      isDraw,
      isKo,
      playerOneStatModifier: p1StatMod,
      playerTwoStatModifier: p2StatMod,
      playerOneMovePoints: p1MovePoints,
      playerTwoMovePoints: p2MovePoints,
      playerOneDamage: p1Damage,
      playerTwoDamage: p2Damage,
      playerOneHpAfter: p1HpAfter,
      playerTwoHpAfter: p2HpAfter,
    } = combat;
    const roundWinnerId =
      combat.winner === 1
        ? battle.player_one_id
        : combat.winner === 2
          ? battle.player_two_id
          : null;

    // ---- Persist judge_runs row (per-round audit) ----
    if (judgeResult) {
      await supabase.from('judge_runs').insert({
        battle_id,
        judge_prompt_version: JUDGE_PROMPT_VERSION,
        model_id: judgeResult.calls.map((c) => c.model_id).join(','),
        seed: judgeResult.calls[0]?.seed ?? 0,
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
          player_one_normalized_scores:
            judgeResult.player_one_normalized_scores,
          player_two_normalized_scores:
            judgeResult.player_two_normalized_scores,
          explanation: judgeResult.explanation,
          calls: judgeResult.calls,
          aggregation: judgeResult.aggregation,
          mock_assisted: judgeResult.mock_assisted,
          combat,
          frozen_inputs: {
            player_one: p1,
            player_two: p2,
            theme: battle.theme,
            rules_version: battle.rules_version ?? 1,
          },
          move_type_matchup: {
            player_one: p1.moveType,
            player_two: p2.moveType,
          },
          forfeit_profile_id: forfeit_profile_id ?? null,
        }
      : forfeitRoundPayload({
          loserId:
            p1Forfeit && !p2Forfeit
              ? battle.player_one_id
              : p2Forfeit && !p1Forfeit
                ? battle.player_two_id
                : null,
          explicit: Boolean(forfeit_profile_id),
          playerOne: p1,
          playerTwo: p2,
          theme: battle.theme,
          rulesVersion: battle.rules_version ?? 1,
        });

    const { error: roundUpdateErr } = await supabase.rpc(
      'complete_battle_round',
      {
        p_round_id: claimedRound.id,
        p_result: {
          status: 'result_ready',
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
          judge_model_id:
            judgeResult?.calls.map((c) => c.model_id).join(',') ?? 'forfeit',
          stat_modifier_player_one: p1StatMod,
          stat_modifier_player_two: p2StatMod,
          // Absolute aggregate points, not a fraction (migration 20260822170000).
          move_type_modifier_player_one: p1MovePoints,
          move_type_modifier_player_two: p2MovePoints,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    );

    if (roundUpdateErr) {
      return errorResponse(
        `Failed to write round result: ${roundUpdateErr.message}`,
        500,
      );
    }

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
        .from('battles')
        .update({ tier0_reveal_payload: revealPayload })
        .eq('id', battle_id);
      if (battleRevealErr) {
        console.error(
          'Failed to write reveal to battles (non-blocking):',
          battleRevealErr,
        );
      }
      await writeRoundRevealPayload(supabase, claimedRound.id, revealPayload);
    } catch (revealErr) {
      console.error(
        'Tier 0 reveal composition failed (non-blocking):',
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
    console.error('round-resolve error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});

async function invokeBattleAdvance(battleId: string): Promise<void> {
  await invokeFunctionAsync('battle-advance', { battle_id: battleId });
}

async function invokeFunctionAsync(
  fn: string,
  body: Record<string, unknown>,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const secretKey = getSupabaseSecretKey();
  if (!supabaseUrl || !secretKey) return;

  const url = `${supabaseUrl}/functions/v1/${fn}`;
  const task = (async () => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore EdgeRuntime exists in deployed Supabase workers.
    EdgeRuntime.waitUntil(task);
  } else {
    await task;
  }
}
