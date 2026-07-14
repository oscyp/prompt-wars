// Resolve Battle Edge Function
// Runs judge pipeline and updates battle result (server-owned, service-role only)

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  getAuthUserId,
  hasSupabaseSecretAuthorization,
  successResponse,
} from '../_shared/utils.ts';
import { runJudgePipeline, JUDGE_PROMPT_VERSION, isBelowQualityFloor } from '../_shared/judge.ts';
import { createJudgeProvider } from '../_shared/providers.ts';
import { computeRatingDeltas } from '../_shared/glicko2.ts';
import { notifyBattleResult } from '../_shared/push.ts';
import { composeRevealPayload } from '../_shared/compose-reveal-payload.ts';

interface ResolveBattleRequest {
  battle_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { battle_id }: ResolveBattleRequest = await req.json();

    if (!battle_id) {
      return errorResponse('battle_id required');
    }

    const authHeader = req.headers.get('Authorization');
    const isServiceRequest = hasSupabaseSecretAuthorization(authHeader);
    let requesterUserId: string | null = null;

    if (!isServiceRequest) {
      try {
        requesterUserId = await getAuthUserId(req);
      } catch {
        return errorResponse(
          'Service role or battle participant required',
          403,
        );
      }
    }

    const supabase = createServiceClient();

    // Fetch battle with prompts and characters for Tier 0 payload
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select(
        `
        *,
        player_one:profiles!battles_player_one_id_fkey(id, rating, rating_deviation, rating_volatility),
        player_two:profiles!battles_player_two_id_fkey(id, rating, rating_deviation, rating_volatility),
        player_one_character:characters!battles_player_one_character_id_fkey(id, name, archetype, signature_color, battle_cry),
        player_two_character:characters!battles_player_two_character_id_fkey(id, name, archetype, signature_color, battle_cry),
        bot_persona:bot_personas(id, name, archetype, signature_color, battle_cry)
      `,
      )
      .eq('id', battle_id)
      .single();

    if (battleError || !battle) {
      return errorResponse('Battle not found');
    }

    // Bo3 short-circuit: round-resolve owns the per-round resolution path.
    // submit-prompt invokes round-resolve directly when both sides lock, so
    // we should not duplicate work here. We no-op with a structured response.
    if ((battle as { format?: string }).format === 'bo3') {
      return successResponse({
        skipped: true,
        reason: 'bo3_uses_round_resolve',
        battle_id,
      });
    }

    if (battle.status !== 'resolving') {
      return errorResponse(`Battle not ready to resolve: ${battle.status}`);
    }

    if (
      !isServiceRequest &&
      requesterUserId !== battle.player_one_id &&
      requesterUserId !== battle.player_two_id
    ) {
      return errorResponse('Battle participant required', 403);
    }

    // Fetch both prompts
    const { data: prompts, error: promptsError } = await supabase
      .from('battle_prompts')
      .select('*')
      .eq('battle_id', battle_id)
      .eq('is_locked', true);

    if (promptsError) {
      return errorResponse('Failed to fetch prompts');
    }

    // Handle bot battles vs human battles
    let p1Prompt, p2Prompt;

    if (battle.is_player_two_bot) {
      // Bot battle: only player one has a prompt in battle_prompts
      if (!prompts || prompts.length !== 1) {
        return errorResponse('Bot battle requires exactly one human prompt');
      }

      p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
      if (!p1Prompt) {
        return errorResponse('Human prompt not found');
      }

      // Generate bot prompt from bot_prompt_library
      const { data: botPrompts, error: botPromptError } = await supabase
        .from('bot_prompt_library')
        .select('*')
        .eq('bot_persona_id', battle.bot_persona_id);

      if (botPromptError || !botPrompts || botPrompts.length === 0) {
        return errorResponse('Bot prompts not found for persona');
      }

      // Select random bot prompt (in production, could match theme/move type)
      const randomBotPrompt =
        botPrompts[Math.floor(Math.random() * botPrompts.length)];

      // Create pseudo-prompt object for bot (not stored in battle_prompts)
      p2Prompt = {
        custom_prompt_text: randomBotPrompt.prompt_text,
        prompt_template_id: null,
        move_type: randomBotPrompt.move_type,
        word_count: randomBotPrompt.prompt_text.split(/\s+/).length,
        profile_id: null, // Bot has no profile
      };
    } else {
      // Human vs human: both prompts in battle_prompts
      if (!prompts || prompts.length !== 2) {
        return errorResponse('Both prompts not found or not locked');
      }

      p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
      p2Prompt = prompts.find((p) => p.profile_id === battle.player_two_id);

      if (!p1Prompt || !p2Prompt) {
        return errorResponse('Prompts mismatch');
      }
    }

    // Get prompt text (template or custom)
    const getPromptText = async (prompt: typeof p1Prompt): Promise<string> => {
      if (prompt.custom_prompt_text) {
        return prompt.custom_prompt_text;
      }

      if (prompt.prompt_template_id) {
        const { data: template } = await supabase
          .from('prompt_templates')
          .select('body')
          .eq('id', prompt.prompt_template_id)
          .single();

        return template?.body || '';
      }

      return '';
    };

    const p1Text = await getPromptText(p1Prompt);
    const p2Text = await getPromptText(p2Prompt);

    if (!p1Text || !p2Text) {
      return errorResponse('Failed to retrieve prompt text');
    }

    // Create judge provider and run pipeline
    const judgeProvider = createJudgeProvider();
    const judgeResult = await runJudgePipeline(
      judgeProvider,
      p1Text,
      p2Text,
      p1Prompt.move_type,
      p2Prompt.move_type,
      p1Prompt.word_count || p1Text.split(/\s+/).length,
      p2Prompt.word_count || p2Text.split(/\s+/).length,
      battle.theme,
      JUDGE_PROMPT_VERSION,
    );

    // Determine winner
    const winnerId =
      judgeResult.winner_profile_id === 'p1'
        ? battle.player_one_id
        : judgeResult.winner_profile_id === 'p2'
          ? battle.player_two_id
          : null;

    // Compute rating deltas (only for ranked). §7.8 quality floor: when both
    // prompts score below the floor, ratings stay untouched so throwaway
    // prompt pairs can't be used for win-trading.
    let ratingDeltaPayload = null;
    const ratingGatedByQualityFloor = isBelowQualityFloor(
      judgeResult.player_one_normalized_scores,
      judgeResult.player_two_normalized_scores,
    );

    if (battle.mode === 'ranked' && !battle.is_player_two_bot && !ratingGatedByQualityFloor) {
      const p1Profile = battle.player_one as unknown as {
        id: string;
        rating: number;
        rating_deviation: number;
        rating_volatility: number;
      };
      const p2Profile = battle.player_two as unknown as {
        id: string;
        rating: number;
        rating_deviation: number;
        rating_volatility: number;
      };

      const deltas = computeRatingDeltas(
        p1Profile.rating,
        p1Profile.rating_deviation,
        p1Profile.rating_volatility,
        p2Profile.rating,
        p2Profile.rating_deviation,
        p2Profile.rating_volatility,
        winnerId === battle.player_one_id,
        judgeResult.is_draw,
      );

      ratingDeltaPayload = {
        [p1Profile.id]: deltas.playerOne,
        [p2Profile.id]: deltas.playerTwo,
      };
    }

    // Build score payload
    const scorePayload = {
      player_one_raw_scores: judgeResult.player_one_raw_scores,
      player_two_raw_scores: judgeResult.player_two_raw_scores,
      player_one_normalized_scores: judgeResult.player_one_normalized_scores,
      player_two_normalized_scores: judgeResult.player_two_normalized_scores,
      explanation: judgeResult.explanation,
      aggregate_score_diff: judgeResult.aggregate_score_diff,
      move_type_matchup: {
        player_one: p1Prompt.move_type,
        player_two: p2Prompt.move_type,
      },
      ...(ratingGatedByQualityFloor ? { rating_gated: 'quality_floor' } : {}),
    };

    // Get judge model ID from provider
    const judgeModelId = judgeProvider.getModelId();

    // Insert judge run
    const { error: judgeRunError } = await supabase.from('judge_runs').insert({
      battle_id,
      judge_prompt_version: JUDGE_PROMPT_VERSION,
      model_id: judgeModelId,
      seed: Math.floor(Math.random() * 10000),
      player_one_raw_scores: judgeResult.player_one_raw_scores,
      player_two_raw_scores: judgeResult.player_two_raw_scores,
      player_one_normalized_scores: judgeResult.player_one_normalized_scores,
      player_two_normalized_scores: judgeResult.player_two_normalized_scores,
      winner_profile_id: winnerId,
      is_draw: judgeResult.is_draw,
      explanation: judgeResult.explanation,
      aggregate_score_diff: judgeResult.aggregate_score_diff,
      run_sequence: 1,
    });

    if (judgeRunError) {
      console.error('Judge run insert error:', judgeRunError);
    }

    // Resolve battle via DB function
    const { error: resolveError } = await supabase.rpc('resolve_battle', {
      p_battle_id: battle_id,
      p_winner_id: winnerId,
      p_is_draw: judgeResult.is_draw,
      p_score_payload: scorePayload,
      p_rating_delta_payload: ratingDeltaPayload,
      p_judge_prompt_version: JUDGE_PROMPT_VERSION,
      p_judge_model_id: judgeModelId,
      p_judge_seed: Math.floor(Math.random() * 10000),
    });

    if (resolveError) {
      console.error('Resolve battle error:', resolveError);
      return errorResponse('Failed to resolve battle', 500);
    }

    // Apply daily-meta rewards (quest progress + win-streak milestone credits).
    // Non-blocking and idempotent: engagement rewards must never block or fail
    // battle completion.
    try {
      const { error: rewardsError } = await supabase.rpc(
        'apply_post_battle_rewards',
        { p_battle_id: battle_id },
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

    // Result is ready: push the must-send "result ready" notification to both
    // human players. Fire-and-forget; never blocks battle completion.
    notifyBattleResult(supabase, battle_id);

    // Compose the Tier 0 reveal SYNCHRONOUSLY and write it to the client-read
    // home (battles.tier0_reveal_payload). The base RevealPayloadV1 is always
    // present the moment status='result_ready'; portrait/audio/video URL fields
    // are additive + nullable and never gate battle completion.
    try {
      const revealPayload = await composeRevealPayload(supabase, {
        battleId: battle_id,
      });
      const { error: revealError } = await supabase
        .from('battles')
        .update({ tier0_reveal_payload: revealPayload })
        .eq('id', battle_id);
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
      // Continue - Tier 0 failure does not block battle completion
    }

    return successResponse({
      battle_id,
      winner_id: winnerId,
      is_draw: judgeResult.is_draw,
      explanation: judgeResult.explanation,
      score_diff: judgeResult.aggregate_score_diff,
    });
  } catch (error) {
    console.error('Resolve battle error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
