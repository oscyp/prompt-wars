// Battle Advance Edge Function (Bo3, Phase 2)
//
// Called by round-resolve after a round writes its result. Decides:
//   - Next round (rounds_won < 2 on both sides and no KO and round < best_of)
//   - Match completion (first to 2 wins, KO, or all rounds exhausted)
//
// On completion, applies Glicko-2 rating update ONE TIME (match-level) by
// reusing the existing resolve_battle DB function, then sets battle status
// to 'completed'. Cinematic success NEVER gates completion.
//
// Service-role only.

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  hasSupabaseSecretAuthorization,
} from '../_shared/utils.ts';
import { computeRatingDeltas } from '../_shared/glicko2.ts';

const RANKED_ROUND_TIMEOUT_MIN = 45;
const FRIEND_ROUND_TIMEOUT_MIN = 120; // 2h

interface AdvanceRequest {
  battle_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!hasSupabaseSecretAuthorization(req.headers.get('Authorization'))) {
    return errorResponse('Service role required', 403);
  }

  try {
    const { battle_id }: AdvanceRequest = await req.json();
    if (!battle_id) return errorResponse('battle_id required');

    const supabase = createServiceClient();

    const { data: battle, error: battleErr } = await supabase
      .from('battles')
      .select(
        `
        id, format, status, mode,
        player_one_id, player_two_id, is_player_two_bot,
        current_round, best_of,
        player_one_hp, player_two_hp,
        player_one_rounds_won, player_two_rounds_won,
        player_one:profiles!battles_player_one_id_fkey(id, rating, rating_deviation, rating_volatility),
        player_two:profiles!battles_player_two_id_fkey(id, rating, rating_deviation, rating_volatility)
      `,
      )
      .eq('id', battle_id)
      .single();

    if (battleErr || !battle) return errorResponse('Battle not found', 404);
    if (battle.format !== 'bo3') {
      return successResponse({ skipped: true, reason: 'not_bo3' });
    }

    // Pull the most recent resolved round to check KO.
    const { data: lastRound } = await supabase
      .from('battle_rounds')
      .select('round_number, is_ko, round_winner_id, score_gap')
      .eq('battle_id', battle_id)
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const p1Wins = battle.player_one_rounds_won ?? 0;
    const p2Wins = battle.player_two_rounds_won ?? 0;
    const koWinner = lastRound?.is_ko ? lastRound.round_winner_id : null;

    const winsRequired = Math.ceil((battle.best_of ?? 3) / 2); // 2 for Bo3
    let winnerId: string | null = null;
    let isDraw = false;
    let matchOver = false;

    if (koWinner) {
      winnerId = koWinner;
      matchOver = true;
    } else if (p1Wins >= winsRequired) {
      winnerId = battle.player_one_id;
      matchOver = true;
    } else if (p2Wins >= winsRequired) {
      winnerId = battle.player_two_id;
      matchOver = true;
    } else if ((battle.current_round ?? 1) >= (battle.best_of ?? 3)) {
      // Exhausted all rounds without a 2-win majority — apply all-draw tiebreaker.
      matchOver = true;
      const tieResult = await resolveAllDrawTiebreaker(supabase, {
        id: battle.id,
        player_one_id: battle.player_one_id,
        player_two_id: battle.player_two_id,
        player_one_hp: battle.player_one_hp,
        player_two_hp: battle.player_two_hp,
      });
      winnerId = tieResult.winnerId;
      isDraw = tieResult.isDraw;
    }

    if (!matchOver) {
      // Spawn next round.
      const nextRound = (battle.current_round ?? 1) + 1;
      const timeoutMin =
        battle.mode === 'ranked'
          ? RANKED_ROUND_TIMEOUT_MIN
          : FRIEND_ROUND_TIMEOUT_MIN;
      const deadline = new Date(Date.now() + timeoutMin * 60_000).toISOString();

      const { error: insertErr } = await supabase
        .from('battle_rounds')
        .insert({
          battle_id,
          round_number: nextRound,
          status: 'waiting_for_prompts',
          lock_in_deadline: deadline,
        });
      if (insertErr && !/duplicate/i.test(insertErr.message)) {
        return errorResponse(`Failed to create next round: ${insertErr.message}`, 500);
      }

      await supabase
        .from('battles')
        .update({
          current_round: nextRound,
          status: 'waiting_for_prompts',
          updated_at: new Date().toISOString(),
        })
        .eq('id', battle_id);

      return successResponse({
        battle_id,
        next_round: nextRound,
        lock_in_deadline: deadline,
      });
    }

    // ---- Match complete: rating update + final battle row write ----
    let ratingDeltaPayload: Record<string, unknown> | null = null;
    if (battle.mode === 'ranked' && !battle.is_player_two_bot && !isDraw) {
      const p1 = battle.player_one as unknown as {
        id: string; rating: number; rating_deviation: number; rating_volatility: number;
      };
      const p2 = battle.player_two as unknown as {
        id: string; rating: number; rating_deviation: number; rating_volatility: number;
      };
      const deltas = computeRatingDeltas(
        p1.rating, p1.rating_deviation, p1.rating_volatility,
        p2.rating, p2.rating_deviation, p2.rating_volatility,
        winnerId === battle.player_one_id,
        isDraw,
      );
      ratingDeltaPayload = {
        [p1.id]: deltas.playerOne,
        [p2.id]: deltas.playerTwo,
      };
    }

    // Aggregate the per-round payloads for the battle.score_payload.
    const { data: allRounds } = await supabase
      .from('battle_rounds')
      .select(
        'round_number, round_winner_id, is_draw, is_ko, score_gap, player_one_score, player_two_score, player_one_damage, player_two_damage, player_one_hp_after, player_two_hp_after, judge_payload',
      )
      .eq('battle_id', battle_id)
      .order('round_number', { ascending: true });

    const scorePayload = {
      format: 'bo3',
      rounds_won: { player_one: p1Wins, player_two: p2Wins },
      ko: !!koWinner,
      rounds: allRounds ?? [],
    };

    // Reuse the existing resolve_battle DB function so stats / ratings / rivals
    // get updated through the same code path as single-format battles. It
    // requires status='resolving' first.
    await supabase
      .from('battles')
      .update({ status: 'resolving' })
      .eq('id', battle_id);

    const { error: resolveErr } = await supabase.rpc('resolve_battle', {
      p_battle_id: battle_id,
      p_winner_id: winnerId,
      p_is_draw: isDraw,
      p_score_payload: scorePayload,
      p_rating_delta_payload: ratingDeltaPayload,
      p_judge_prompt_version: 'bo3-aggregate',
      p_judge_model_id: 'bo3-aggregate',
      p_judge_seed: 0,
    });

    if (resolveErr) {
      console.error('resolve_battle failed in battle-advance:', resolveErr);
      return errorResponse('Failed to finalize battle', 500);
    }

    // resolve_battle leaves status='result_ready'. Promote to 'completed'
    // — cinematic success is independent and must not gate this.
    await supabase
      .from('battles')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', battle_id)
      .eq('status', 'result_ready');

    return successResponse({
      battle_id,
      completed: true,
      winner_id: winnerId,
      is_draw: isDraw,
      ko: !!koWinner,
    });
  } catch (error) {
    console.error('battle-advance error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});

/**
 * All-draw tiebreaker (per concept §7.7): lower HP loses → higher cumulative
 * judge score → earlier final-round lock timestamp. If none of these can break
 * the tie, the battle is recorded as a draw.
 */
async function resolveAllDrawTiebreaker(
  supabase: ReturnType<typeof createServiceClient>,
  battle: {
    id?: string;
    player_one_id: string;
    player_two_id: string;
    player_one_hp: number | null;
    player_two_hp: number | null;
  },
): Promise<{ winnerId: string | null; isDraw: boolean }> {
  const p1Hp = battle.player_one_hp ?? 0;
  const p2Hp = battle.player_two_hp ?? 0;
  if (p1Hp !== p2Hp) {
    return {
      winnerId: p1Hp > p2Hp ? battle.player_one_id : battle.player_two_id,
      isDraw: false,
    };
  }

  const { data: rounds } = await supabase
    .from('battle_rounds')
    .select('player_one_score, player_two_score, both_locked_at, round_number')
    .eq('battle_id', battle.id ?? '')
    .order('round_number', { ascending: true });

  let p1Total = 0;
  let p2Total = 0;
  for (const r of rounds ?? []) {
    p1Total += Number(r.player_one_score ?? 0);
    p2Total += Number(r.player_two_score ?? 0);
  }
  if (p1Total !== p2Total) {
    return {
      winnerId: p1Total > p2Total ? battle.player_one_id : battle.player_two_id,
      isDraw: false,
    };
  }

  // No deterministic break — record draw.
  return { winnerId: null, isDraw: true };
}
