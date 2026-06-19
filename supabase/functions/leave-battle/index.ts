// Leave Battle Edge Function
//
// Handles pre-prompt exits from the face-off screen. Ranked human-vs-human
// exits are forfeits that award the opponent a win. Unranked, bot, and queued
// exits cancel the battle before prompt lock.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  successResponse,
} from '../_shared/utils.ts';

interface LeaveBattleRequest {
  battle_id: string;
}

interface BattleRow {
  id: string;
  mode: string;
  status: string;
  player_one_id: string;
  player_two_id: string | null;
  is_player_two_bot: boolean;
}

const cancelableStatuses = ['created', 'matched', 'waiting_for_prompts'];
const terminalStatuses = [
  'completed',
  'expired',
  'canceled',
  'moderation_failed',
  'generation_failed',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const { battle_id }: LeaveBattleRequest = await req.json();

    if (!battle_id) {
      return errorResponse('battle_id required', 400);
    }

    const supabase = createServiceClient();
    const { data: battle, error: battleError } = await supabase
      .from('battles')
      .select(
        'id, mode, status, player_one_id, player_two_id, is_player_two_bot',
      )
      .eq('id', battle_id)
      .maybeSingle();

    if (battleError) return errorResponse(battleError.message, 500);
    if (!battle) return errorResponse('Battle not found', 404);

    const row = battle as BattleRow;
    const isParticipant =
      row.player_one_id === userId || row.player_two_id === userId;
    if (!isParticipant) {
      return errorResponse('Battle participant required', 403);
    }

    if (terminalStatuses.includes(row.status)) {
      return successResponse({ success: true, action: 'already_terminal' });
    }

    if (!cancelableStatuses.includes(row.status)) {
      return errorResponse('Battle has already started', 409);
    }

    const { count: lockedPromptCount } = await supabase
      .from('battle_prompts')
      .select('id', { count: 'exact', head: true })
      .eq('battle_id', battle_id)
      .eq('is_locked', true);

    if ((lockedPromptCount ?? 0) > 0) {
      return errorResponse('Battle has already started', 409);
    }

    const isRankedHumanMatch =
      row.mode === 'ranked' && !row.is_player_two_bot && row.player_two_id;

    if (!isRankedHumanMatch) {
      const { error: cancelError } = await supabase
        .from('battles')
        .update({ status: 'canceled', completed_at: new Date().toISOString() })
        .eq('id', battle_id)
        .in('status', cancelableStatuses);

      if (cancelError) return errorResponse(cancelError.message, 500);
      return successResponse({ success: true, action: 'canceled' });
    }

    const winnerId =
      userId === row.player_one_id ? row.player_two_id : row.player_one_id;
    if (!winnerId) {
      return errorResponse('Opponent not found', 409);
    }

    const nowIso = new Date().toISOString();
    const scorePayload = {
      outcome: 'forfeit',
      forfeiter_id: userId,
      winner_id: winnerId,
      explanation: 'Battle forfeited before prompt lock.',
    };

    const { data: updated, error: updateError } = await supabase
      .from('battles')
      .update({
        status: 'completed',
        winner_id: winnerId,
        is_draw: false,
        score_payload: scorePayload,
        tier0_reveal_payload: {
          summary: 'Battle ended by forfeit before prompt lock.',
        },
        completed_at: nowIso,
      })
      .eq('id', battle_id)
      .in('status', cancelableStatuses)
      .select('id')
      .maybeSingle();

    if (updateError) return errorResponse(updateError.message, 500);
    if (!updated) return errorResponse('Battle could not be forfeited', 409);

    await updateForfeitStats(supabase, row, winnerId);

    return successResponse({
      success: true,
      action: 'forfeited',
      winner_id: winnerId,
    });
  } catch (error) {
    console.error('leave-battle error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});

async function updateForfeitStats(
  supabase: ReturnType<typeof createServiceClient>,
  battle: BattleRow,
  winnerId: string,
): Promise<void> {
  const participantIds = [battle.player_one_id, battle.player_two_id].filter(
    Boolean,
  ) as string[];

  for (const profileId of participantIds) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'wins, losses, current_streak, best_streak, total_battles, first_battle_completed_at',
      )
      .eq('id', profileId)
      .single();

    if (error || !profile) {
      console.error(
        'Failed to load profile for forfeit stats:',
        profileId,
        error,
      );
      continue;
    }

    const didWin = profileId === winnerId;
    const nextStreak = didWin ? (profile.current_streak ?? 0) + 1 : 0;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        total_battles: (profile.total_battles ?? 0) + 1,
        wins: (profile.wins ?? 0) + (didWin ? 1 : 0),
        losses: (profile.losses ?? 0) + (didWin ? 0 : 1),
        current_streak: nextStreak,
        best_streak: didWin
          ? Math.max(profile.best_streak ?? 0, nextStreak)
          : (profile.best_streak ?? 0),
        first_battle_completed_at:
          profile.first_battle_completed_at ?? new Date().toISOString(),
      })
      .eq('id', profileId);

    if (updateError) {
      console.error('Failed to update forfeit stats:', profileId, updateError);
    }
  }
}
