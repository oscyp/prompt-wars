// Daily Meta Edge Function
// Server-owned daily engagement loop: login streak claim, quest assignment +
// progress read + claim, and cosmetic unlock sync. None of this gates battle
// completion; it is the additive F2P credit spine.

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  successResponse,
  getAuthUserId,
  generateIdempotencyKey,
} from '../_shared/utils.ts';

interface DailyMetaRequest {
  action?: 'sync' | 'claim_login' | 'claim_quest';
  quest_id?: string;
}

const todayStr = () => new Date().toISOString().split('T')[0];

async function loadState(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const today = todayStr();

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'daily_login_streak, daily_login_last_date, daily_login_mercy_used_this_week, current_streak, best_streak',
    )
    .eq('id', userId)
    .single();

  const { data: quests } = await supabase
    .from('player_daily_quests')
    .select('*, quest:daily_quests(*)')
    .eq('profile_id', userId)
    .eq('quest_date', today)
    .order('quest_date', { ascending: false });

  const loginClaimedToday = profile?.daily_login_last_date === today;

  return {
    login: {
      streak: profile?.daily_login_streak ?? 0,
      claimed_today: loginClaimedToday,
      mercy_used_this_week: profile?.daily_login_mercy_used_this_week ?? false,
    },
    win_streak: {
      current: profile?.current_streak ?? 0,
      best: profile?.best_streak ?? 0,
    },
    quests: quests ?? [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);
    const body: DailyMetaRequest = await req.json().catch(() => ({}));
    const action = body.action ?? 'sync';
    const supabase = createServiceClient();

    // --- Claim a completed quest ------------------------------------------
    if (action === 'claim_quest') {
      if (!body.quest_id) {
        return errorResponse('quest_id required');
      }

      const today = todayStr();

      const { data: quest } = await supabase
        .from('daily_quests')
        .select('*')
        .eq('id', body.quest_id)
        .eq('is_active', true)
        .single();

      if (!quest) {
        return errorResponse('Invalid quest');
      }

      const { data: progress } = await supabase
        .from('player_daily_quests')
        .select('*')
        .eq('profile_id', userId)
        .eq('daily_quest_id', body.quest_id)
        .eq('quest_date', today)
        .single();

      if (!progress || progress.completed) {
        return errorResponse('Quest not eligible or already completed');
      }

      if (progress.current_value < quest.target_value) {
        return errorResponse('Quest not completed yet');
      }

      // Flip to completed atomically: only the request that wins the
      // completed=false -> true transition proceeds to grant. This closes the
      // check-then-act race between two concurrent claim_quest calls (the
      // grant itself is also idempotency-key protected as defense in depth).
      const { data: flipped } = await supabase
        .from('player_daily_quests')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', progress.id)
        .eq('completed', false)
        .select('id');

      if (!flipped || flipped.length === 0) {
        return errorResponse('Quest already claimed');
      }

      const idempotencyKey = generateIdempotencyKey([
        'quest',
        userId,
        body.quest_id,
        today,
      ]);

      const { error: grantError } = await supabase.rpc('grant_credits', {
        p_profile_id: userId,
        p_amount: quest.reward_credits,
        p_reason: 'quest_complete',
        p_idempotency_key: idempotencyKey,
        p_battle_id: null,
        p_purchase_id: null,
        p_metadata: { quest_id: body.quest_id, quest_title: quest.title },
      });

      if (grantError) {
        console.error('Quest grant error:', grantError);
        return errorResponse('Failed to grant quest reward', 500);
      }

      return successResponse({
        success: true,
        credits_granted: quest.reward_credits,
        xp_granted: quest.reward_xp,
      });
    }

    // --- Claim the daily login streak -------------------------------------
    if (action === 'claim_login') {
      const { error: loginError } = await supabase.rpc(
        'update_daily_login_streak',
        { p_profile_id: userId },
      );
      if (loginError) {
        console.error('Daily login error:', loginError);
        return errorResponse('Failed to process daily login', 500);
      }
      const state = await loadState(supabase, userId);
      return successResponse({ success: true, ...state });
    }

    // --- Default: full daily sync -----------------------------------------
    // Keep "today" stocked with quests, assign them to the player, auto-claim
    // the login reward, and grant any newly-earned cosmetics. All idempotent.
    const { error: rolloverError } = await supabase.rpc('rollover_daily_quests');
    if (rolloverError) {
      console.error('rollover_daily_quests failed (non-fatal):', rolloverError);
    }

    const { error: ensureError } = await supabase.rpc('ensure_daily_quests', {
      p_profile_id: userId,
    });
    if (ensureError) {
      console.error('ensure_daily_quests error:', ensureError);
    }

    const { error: loginError } = await supabase.rpc(
      'update_daily_login_streak',
      { p_profile_id: userId },
    );
    if (loginError) {
      console.error('Daily login error (non-fatal):', loginError);
    }

    const { error: cosmeticError } = await supabase.rpc(
      'sync_unlocked_cosmetics',
      { p_profile_id: userId },
    );
    if (cosmeticError) {
      console.error('sync_unlocked_cosmetics error (non-fatal):', cosmeticError);
    }

    const state = await loadState(supabase, userId);
    return successResponse({ success: true, ...state });
  } catch (error) {
    console.error('Daily meta error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
