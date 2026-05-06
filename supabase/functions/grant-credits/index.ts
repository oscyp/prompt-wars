// Grant Credits Edge Function
// Server-owned credit grants for daily login, quests, etc.

import { createServiceClient, corsHeaders, errorResponse, successResponse, getAuthUserId, generateIdempotencyKey } from '../_shared/utils.ts';

interface GrantCreditsRequest {
  reason: 'daily_login' | 'quest_complete' | 'battle_win' | 'judge_minigame';
  amount?: number;
  quest_id?: string;
  battle_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const userId = await getAuthUserId(req);
    const { reason, amount, quest_id, battle_id }: GrantCreditsRequest = await req.json();
    
    if (!reason) {
      return errorResponse('reason required');
    }
    
    const supabase = createServiceClient();
    
    // Handle daily login
    if (reason === 'daily_login') {
      const { error: loginError } = await supabase.rpc('update_daily_login_streak', {
        p_profile_id: userId,
      });
      
      if (loginError) {
        console.error('Daily login error:', loginError);
        return errorResponse('Failed to process daily login', 500);
      }
      
      return successResponse({
        success: true,
        message: 'Daily login processed',
      });
    }
    
    // Handle quest completion
    if (reason === 'quest_complete' && quest_id) {
      // Validate quest completion
      const { data: quest } = await supabase
        .from('daily_quests')
        .select('*')
        .eq('id', quest_id)
        .eq('is_active', true)
        .single();
      
      if (!quest) {
        return errorResponse('Invalid quest');
      }
      
      // Check player progress
      const { data: progress } = await supabase
        .from('player_daily_quests')
        .select('*')
        .eq('profile_id', userId)
        .eq('daily_quest_id', quest_id)
        .eq('quest_date', new Date().toISOString().split('T')[0])
        .single();
      
      if (!progress || progress.completed) {
        return errorResponse('Quest not eligible or already completed');
      }
      
      if (progress.current_value < quest.target_value) {
        return errorResponse('Quest not completed yet');
      }
      
      // Mark as completed
      await supabase
        .from('player_daily_quests')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', progress.id);
      
      // Grant credits
      const idempotencyKey = generateIdempotencyKey(['quest', userId, quest_id, new Date().toISOString().split('T')[0]]);
      
      const { error: grantError } = await supabase.rpc('grant_credits', {
        p_profile_id: userId,
        p_amount: quest.reward_credits,
        p_reason: 'quest_complete',
        p_idempotency_key: idempotencyKey,
        p_battle_id: null,
        p_purchase_id: null,
        p_metadata: { quest_id, quest_title: quest.title },
      });
      
      if (grantError) {
        console.error('Grant credits error:', grantError);
        return errorResponse('Failed to grant credits', 500);
      }
      
      return successResponse({
        success: true,
        credits_granted: quest.reward_credits,
        xp_granted: quest.reward_xp,
      });
    }
    
    // Generic grant (requires amount)
    if (amount && amount > 0) {
      const idempotencyKey = generateIdempotencyKey([reason, userId, Date.now().toString()]);
      
      const { error: grantError } = await supabase.rpc('grant_credits', {
        p_profile_id: userId,
        p_amount: amount,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
        p_battle_id: battle_id ?? null,
        p_purchase_id: null,
        p_metadata: {},
      });
      
      if (grantError) {
        console.error('Grant credits error:', grantError);
        return errorResponse('Failed to grant credits', 500);
      }
      
      return successResponse({
        success: true,
        credits_granted: amount,
      });
    }
    
    return errorResponse('Invalid grant request');
    
  } catch (error) {
    console.error('Grant credits error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});
