// Sign Battle Portraits Edge Function
//
// Returns short-lived signed portrait URLs for BOTH participants of a battle so
// the client's pre-battle face-off can display each side's CURRENT generated
// character portrait. Portraits live in the private `character-portraits`
// bucket and are otherwise unreadable cross-participant, so signing is done
// server-side with the service role AFTER gating on the caller being a battle
// participant (`player_one_id` OR `player_two_id`).
//
// Contract:
//   POST { "battle_id": string }   (caller's Supabase auth JWT; a participant)
//   200  { player_one: { portrait_url: string | null, archetype: string | null },
//          player_two: { portrait_url: string | null, archetype: string | null } }
//   400 battle_id required | 401 Unauthorized | 403 participant required |
//   404 Battle not found | 500 internal
//
// Portrait loading + signing is REUSED from `_shared/compose-reveal-payload.ts`
// (`resolveCurrentPortrait` + `signPortraitPath`); see resolve-battle-portraits.ts.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  successResponse,
} from '../_shared/utils.ts';
import { resolveBattlePortraits } from './resolve-battle-portraits.ts';

interface SignBattlePortraitsRequest {
  battle_id?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  // Resolve the caller from their JWT (participant gate depends on this id).
  let userId: string;
  try {
    userId = await getAuthUserId(req);
  } catch (_error) {
    return errorResponse('Unauthorized', 401);
  }

  let battleId = '';
  try {
    const body = (await req.json()) as SignBattlePortraitsRequest;
    battleId = typeof body?.battle_id === 'string' ? body.battle_id.trim() : '';
  } catch (_error) {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!battleId) {
    return errorResponse('battle_id required', 400);
  }

  try {
    const supabase = createServiceClient();
    const result = await resolveBattlePortraits(supabase, {
      battleId,
      callerUserId: userId,
    });

    if (result.kind === 'not_found') {
      return errorResponse('Battle not found', 404);
    }
    if (result.kind === 'forbidden') {
      return errorResponse('Battle participant required', 403);
    }
    return successResponse(result.payload);
  } catch (error) {
    console.error('sign-battle-portraits error:', error);
    return errorResponse('Internal error', 500);
  }
});
