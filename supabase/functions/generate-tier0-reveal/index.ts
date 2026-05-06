// Generate Tier 0 Reveal Edge Function
// Creates free cinematic reveal payload for result_ready battles
// Always succeeds, never blocks battle completion

import { createServiceClient, corsHeaders, errorResponse, successResponse } from '../_shared/utils.ts';
import { createImageProvider, createTtsProvider } from '../_shared/providers.ts';

interface GenerateTier0RevealRequest {
  battle_id: string;
}

interface Tier0RevealPayload {
  battleId: string;
  tier: 0;
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
    const { battle_id }: GenerateTier0RevealRequest = await req.json();

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

    if (battle.status !== 'result_ready') {
      return errorResponse(`Battle not ready for reveal: ${battle.status}`);
    }

    // Fetch prompts to get move types
    const { data: prompts, error: promptsError } = await supabase
      .from('battle_prompts')
      .select('*')
      .eq('battle_id', battle_id)
      .eq('is_locked', true);

    if (promptsError || !prompts || prompts.length !== 2) {
      return errorResponse('Prompts not found');
    }

    const p1Prompt = prompts.find((p) => p.profile_id === battle.player_one_id);
    const p2Prompt = prompts.find((p) => p.profile_id === battle.player_two_id);

    if (!p1Prompt || !p2Prompt) {
      return errorResponse('Prompts mismatch');
    }

    // Extract score payload
    const scorePayload = battle.score_payload as Record<string, unknown> || {};
    const isDraw = battle.is_draw || false;
    const winnerId = battle.winner_id;

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
      moveTypeWinner: winnerId === battle.player_one_id ? p1Prompt.move_type : p2Prompt.move_type,
      moveTypeLoser: winnerId === battle.player_one_id ? p2Prompt.move_type : p1Prompt.move_type,
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

    // Store reveal payload in battle metadata
    const { error: updateError } = await supabase
      .from('battles')
      .update({
        tier0_reveal_payload: tier0Payload,
      })
      .eq('id', battle_id);

    if (updateError) {
      console.error('Failed to store Tier 0 reveal:', updateError);
      return errorResponse('Failed to store reveal payload');
    }

    return successResponse({
      battle_id,
      tier: 0,
      payload: tier0Payload,
    });
  } catch (error) {
    console.error('Tier 0 reveal generation error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
