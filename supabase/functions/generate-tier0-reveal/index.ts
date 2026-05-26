// Generate Tier 0 Reveal Edge Function
// Creates free cinematic reveal payload for result_ready battles
// Always succeeds, never blocks battle completion

import { createServiceClient, corsHeaders, errorResponse, successResponse } from '../_shared/utils.ts';
import { createImageProvider, createTtsProvider } from '../_shared/providers.ts';

interface GenerateTier0RevealRequest {
  battle_id: string;
  // Optional per-round hints (Bo3). When `battle_round_id` is provided the
  // reveal payload is composed from THAT round's frozen result, not the whole
  // battle aggregate. Single-format calls omit these and behave exactly as
  // before.
  battle_round_id?: string;
  round_number?: number;
}

interface Tier0RevealPayload {
  battleId: string;
  tier: 0;
  // Per-round identifiers (null for single-format / series-end reveals).
  battleRoundId: string | null;
  roundNumber: number | null;
  compositionType: string;
  animationPreset: string;
  musicStingId: string;
  battleCryVoicePreset: string;
  battleCryDurationMs: number;
  metadata: {
    winnerCharacter: string;
    loserCharacter: string;
    winnerArchetype: string;
    winnerColor: string;
    moveMatchup: string;
    isDraw: boolean;
    isKo?: boolean;
    damage?: number;
    hpAfter?: { playerOne: number | null; playerTwo: number | null };
  };
  scoreCard: {
    playerOneScores: Record<string, number>;
    playerTwoScores: Record<string, number>;
    explanation: string;
    winnerId: string | null;
    isDraw: boolean;
  };
  generatedAt: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { battle_id, battle_round_id, round_number }: GenerateTier0RevealRequest =
      await req.json();

    if (!battle_id) {
      return errorResponse('battle_id required');
    }

    const supabase = createServiceClient();

    // Fetch battle with full context
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select(`
        *,
        player_one_character:characters!battles_player_one_character_id_fkey(*),
        player_two_character:characters!battles_player_two_character_id_fkey(*)
      `)
      .eq('id', battle_id)
      .single();

    if (battleError || !battle) {
      return errorResponse('Battle not found');
    }

    // --- Resolve per-round vs whole-battle context -----------------------
    // Per-round: load THIS round's frozen result and prompts.
    // Series-end / single-format: keep legacy behavior (battle aggregate).
    let round: Record<string, unknown> | null = null;
    if (battle_round_id) {
      const { data: r } = await supabase
        .from('battle_rounds')
        .select('*')
        .eq('id', battle_round_id)
        .single();
      round = r ?? null;
      if (!round) {
        return errorResponse('battle_round_id not found', 404);
      }
      if (round.status !== 'result_ready') {
        // Tier 0 must never block round resolution; if the round somehow is
        // not ready, exit successfully without writing a payload.
        return successResponse({
          battle_id,
          battle_round_id,
          skipped: true,
          reason: `round.status=${round.status}`,
        });
      }
    } else if (battle.status !== 'result_ready') {
      return errorResponse(`Battle not ready for reveal: ${battle.status}`);
    }

    // Fetch prompts (scoped to the round when present).
    const promptsQuery = supabase
      .from('battle_prompts')
      .select('*')
      .eq('battle_id', battle_id)
      .eq('is_locked', true);
    if (round_number != null) {
      promptsQuery.eq('round_number', round_number);
    }
    const { data: prompts, error: promptsError } = await promptsQuery;

    if (promptsError || !prompts || prompts.length === 0) {
      return errorResponse('Prompts not found');
    }

    const p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
    const p2Prompt = prompts.find((p) => p.profile_id === battle.player_two_id);

    if (!p1Prompt || (!p2Prompt && !battle.is_player_two_bot)) {
      return errorResponse('Prompts mismatch');
    }

    // Outcome: per-round wins over battle aggregate when round context exists.
    const isDraw = round ? !!round.is_draw : (battle.is_draw || false);
    const winnerId = round
      ? (round.round_winner_id as string | null)
      : battle.winner_id;

    // Score payload source: per-round judge_payload when in round mode,
    // otherwise the legacy battle.score_payload aggregate.
    const scorePayload: Record<string, unknown> = round
      ? ((round.judge_payload as Record<string, unknown>) ?? {})
      : ((battle.score_payload as Record<string, unknown>) ?? {});

    const winnerCharacter = winnerId === battle.player_one_id
      ? battle.player_one_character
      : winnerId === battle.player_two_id
      ? battle.player_two_character
      : battle.player_one_character; // fallback for draw

    const loserCharacter = winnerId === battle.player_one_id
      ? battle.player_two_character
      : battle.player_one_character;

    // Generate motion poster metadata (deterministic, always succeeds)
    const imageProvider = createImageProvider();
    const motionPoster = await imageProvider.generateMotionPoster({
      battleId: battle_id,
      winnerCharacterName: winnerCharacter.name,
      winnerArchetype: winnerCharacter.archetype,
      winnerSignatureColor: winnerCharacter.signature_color,
      loserCharacterName: loserCharacter.name,
      loserArchetype: loserCharacter.archetype,
      moveTypeWinner: winnerId === battle.player_one_id ? p1Prompt.move_type : p2Prompt?.move_type,
      moveTypeLoser: winnerId === battle.player_one_id ? p2Prompt?.move_type : p1Prompt.move_type,
      isDraw,
    });

    // Generate battle cry voice line metadata (client-side TTS)
    const ttsProvider = createTtsProvider();
    const battleCry = await ttsProvider.generateBattleCry({
      battleCryText: winnerCharacter.battle_cry || 'Victory!',
      characterArchetype: winnerCharacter.archetype,
      voicePreset: '', // provider will determine
    });

    // Construct Tier 0 reveal payload
    const tier0Payload: Tier0RevealPayload = {
      battleId: battle_id,
      tier: 0,
      battleRoundId: battle_round_id ?? null,
      roundNumber: round_number ?? null,
      compositionType: motionPoster.compositionType,
      animationPreset: motionPoster.animationPreset,
      musicStingId: motionPoster.musicStingId,
      battleCryVoicePreset: battleCry.voicePreset,
      battleCryDurationMs: battleCry.durationMs,
      metadata: {
        winnerCharacter: winnerCharacter.name,
        loserCharacter: loserCharacter.name,
        winnerArchetype: winnerCharacter.archetype,
        winnerColor: winnerCharacter.signature_color,
        moveMatchup: motionPoster.metadata.moveMatchup,
        isDraw,
        ...(round
          ? {
              isKo: !!round.is_ko,
              damage:
                winnerId === battle.player_one_id
                  ? (round.player_two_damage as number)
                  : winnerId === battle.player_two_id
                  ? (round.player_one_damage as number)
                  : 0,
              hpAfter: {
                playerOne: (round.player_one_hp_after as number | null) ?? null,
                playerTwo: (round.player_two_hp_after as number | null) ?? null,
              },
            }
          : {}),
      },
      scoreCard: {
        playerOneScores: (scorePayload.player_one_normalized_scores as Record<string, number>) || {},
        playerTwoScores: (scorePayload.player_two_normalized_scores as Record<string, number>) || {},
        explanation: (scorePayload.explanation as string) || '',
        winnerId,
        isDraw,
      },
      generatedAt: new Date().toISOString(),
    };

    // Persist:
    //   - Round mode: write asset URL + tier back onto battle_rounds so the
    //     client's per-round subscription renders immediately. Tier 0 is
    //     composed metadata (no provider asset URL); we synthesize a
    //     deterministic reference clients resolve locally.
    //   - Legacy mode: keep storing on battles.tier0_reveal_payload.
    if (round && battle_round_id) {
      const cinematicAssetUrl = `tier0://battle_rounds/${battle_round_id}`;
      const { error: roundWriteErr } = await supabase
        .from('battle_rounds')
        .update({
          cinematic_asset_url: cinematicAssetUrl,
          cinematic_tier: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', battle_round_id);
      if (roundWriteErr) {
        console.error('Failed to write Tier 0 to battle_rounds:', roundWriteErr);
        // Non-fatal: client still has tier0_reveal_payload on battles for fallback.
      }
    } else {
      const { error: updateError } = await supabase
        .from('battles')
        .update({ tier0_reveal_payload: tier0Payload })
        .eq('id', battle_id);
      if (updateError) {
        console.error('Failed to store Tier 0 reveal:', updateError);
        return errorResponse('Failed to store reveal payload');
      }
    }

    return successResponse({
      battle_id,
      battle_round_id: battle_round_id ?? null,
      round_number: round_number ?? null,
      tier: 0,
      payload: tier0Payload,
    });
  } catch (error) {
    console.error('Tier 0 reveal generation error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
