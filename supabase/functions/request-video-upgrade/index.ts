// Request Video Upgrade Edge Function
// Server-owned video tier upgrade decision: validates entitlements, spends credits/allowance, creates video job

import { 
  createServiceClient, 
  corsHeaders, 
  errorResponse, 
  successResponse, 
  getAuthUserId,
  generateIdempotencyKey 
} from '../_shared/utils.ts';
import { hashTier1Payload } from '../_shared/compose-tier1-payload.ts';
import { composePerRoundPayload } from '../_shared/per-round-payload.ts';
import { TIER1_PER_ROUND_COST_UNITS, type VideoJobTrigger } from '../_shared/video-constants.ts';
import {
  checkRoundUpgradeEntitlement,
  finalizeRoundUpgradeEntitlement,
  type RoundUpgradeSource,
} from '../_shared/entitlement-gate.ts';

interface RequestVideoUpgradeRequest {
  battle_id: string;
  auto_spend?: boolean; // If true, spend credits or allowance without re-prompting cost
  // Optional per-round upgrade (Bo3). When omitted, behavior is unchanged.
  battle_round_id?: string;
  round_number?: number;
}

interface EntitlementCheck {
  can_upgrade: boolean;
  method: 'subscription_allowance' | 'credits' | 'free_grant' | 'none';
  cost_credits?: number;
  allowance_remaining?: number;
  credits_balance?: number;
  free_grants_remaining?: number;
  error?: string;
}

const TIER_1_VIDEO_COST = 1; // 1 credit per battle video upgrade

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const userId = await getAuthUserId(req);
    const {
      battle_id,
      auto_spend = false,
      battle_round_id,
      round_number,
    }: RequestVideoUpgradeRequest = await req.json();
    
    if (!battle_id) {
      return errorResponse('battle_id required');
    }
    
    const supabase = createServiceClient();
    
    // 1. Validate user is battle participant (load full battle when in round mode
    //    so we can compose the Tier 1 payload from frozen rows).
    const battleSelect = battle_round_id
      ? '*, player_one_character:characters!battles_player_one_character_id_fkey(*), player_two_character:characters!battles_player_two_character_id_fkey(*)'
      : 'id, status, player_one_id, player_two_id';
    const { data: battleRaw, error: battleError } = await supabase
      .from('battles')
      .select(battleSelect as any)
      .eq('id', battle_id)
      .single();
    const battle = battleRaw as any;
    
    if (battleError || !battle) {
      return errorResponse('Battle not found', 404);
    }
    
    if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
      return errorResponse('Not a participant in this battle', 403);
    }
    
    // 2. Validate state. For per-round upgrades the round itself must be
    //    result_ready (frozen outcome) — battle.status may still be 'resolving'
    //    for Bo3 mid-series. For legacy calls, fall back to the prior check.
    if (battle_round_id) {
      const { data: rRow, error: rErr } = await supabase
        .from('battle_rounds')
        .select('id, status, battle_id')
        .eq('id', battle_round_id)
        .single();
      if (rErr || !rRow) return errorResponse('battle_round_id not found', 404);
      if (rRow.battle_id !== battle_id) {
        return errorResponse('battle_round_id does not belong to battle_id', 400);
      }
      if (rRow.status !== 'result_ready') {
        return errorResponse(
          `Round not ready for upgrade. Round status: ${rRow.status}`,
          400,
        );
      }
    } else {
      if (!['result_ready', 'completed'].includes(battle.status)) {
        return errorResponse(`Battle not ready for video upgrade. Status: ${battle.status}`, 400);
      }
    }
    
    // 3. Idempotency check.
    //    Per-round: check on (battle_id, round_number, tier=1).
    //    Legacy: existing one-job-per-battle behavior (battle_round_id IS NULL).
    let existingJobQuery = supabase
      .from('video_jobs')
      .select('id, status')
      .eq('battle_id', battle_id)
      .eq('tier', 1);
    if (battle_round_id) {
      existingJobQuery = existingJobQuery.eq('battle_round_id', battle_round_id);
    } else {
      existingJobQuery = existingJobQuery.is('battle_round_id', null);
    }
    const { data: existingJob } = await existingJobQuery.maybeSingle();
    
    if (existingJob) {
      // For per-round: hard 409 per spec.
      if (battle_round_id) {
        return errorResponse(
          `Tier 1 already requested for this round (job ${existingJob.id}, status ${existingJob.status})`,
          409,
        );
      }
      return successResponse({
        already_requested: true,
        video_job_id: existingJob.id,
        status: existingJob.status,
        message: 'Video already requested for this battle',
      });
    }
    
    // 4. Entitlement check.
    //    Per-round (Bo3): use round-unit gate (`checkRoundUpgradeEntitlement`).
    //    Legacy single-format: keep prior per-battle gate for one release.
    let roundGateResult:
      | {
          source: RoundUpgradeSource;
          reservation_id: string | null;
          is_full_battle: boolean;
        }
      | null = null;
    let legacySpendResult:
      | { success: boolean; source: string; transaction_id?: string }
      | null = null;
    let legacyMethod: string | null = null;

    if (battle_round_id) {
      const gate = await checkRoundUpgradeEntitlement(
        userId,
        battle_id,
        round_number ?? 1,
        supabase as any,
        {
          battle: {
            id: (battle as any).id,
            format: (battle as any).format ?? 'bo3',
            best_of: (battle as any).best_of ?? 3,
            player_one_rounds_won: (battle as any).player_one_rounds_won ?? 0,
            player_two_rounds_won: (battle as any).player_two_rounds_won ?? 0,
          },
        },
      );

      if (!gate.allowed || !gate.source) {
        return successResponse({
          can_upgrade: false,
          entitlement_check: {
            can_upgrade: false,
            method: 'none',
            error: gate.reason ?? 'not_entitled',
          },
          message: gate.reason ?? 'Not entitled to round upgrade',
        });
      }

      // Cost preview branch — must release any reservation we took.
      if (!auto_spend) {
        if (gate.reservation_id) {
          await finalizeRoundUpgradeEntitlement(
            {
              reservation_id: gate.reservation_id,
              source: gate.source,
              profile_id: userId,
              battle_id,
              round_number: round_number ?? 1,
              is_full_battle: gate.is_full_battle,
            },
            'failed',
            supabase as any,
          );
        }
        return successResponse({
          can_upgrade: true,
          entitlement_check: {
            can_upgrade: true,
            method: gate.source,
            cost_credits: gate.source === 'credit' ? TIER_1_VIDEO_COST : 0,
          },
          cost_preview: {
            method: gate.source,
            cost_credits: gate.source === 'credit' ? TIER_1_VIDEO_COST : 0,
            is_full_battle: gate.is_full_battle,
          },
          message: 'Round upgrade available. Call again with auto_spend=true to proceed.',
        });
      }

      roundGateResult = {
        source: gate.source,
        reservation_id: gate.reservation_id ?? null,
        is_full_battle: !!gate.is_full_battle,
      };
    } else {
      // Legacy single-format path (unchanged).
      const entitlementCheck = await checkVideoUpgradeEntitlement(supabase, userId);

      if (!entitlementCheck.can_upgrade) {
        return successResponse({
          can_upgrade: false,
          entitlement_check: entitlementCheck,
          message: entitlementCheck.error || 'Not entitled to video upgrade',
        });
      }

      if (!auto_spend) {
        return successResponse({
          can_upgrade: true,
          entitlement_check: entitlementCheck,
          cost_preview: {
            method: entitlementCheck.method,
            cost_credits: entitlementCheck.cost_credits,
          },
          message: 'Video upgrade available. Call again with auto_spend=true to proceed.',
        });
      }

      switch (entitlementCheck.method) {
        case 'subscription_allowance':
          legacySpendResult = await spendSubscriptionAllowance(supabase, userId, battle_id);
          break;
        case 'credits':
          legacySpendResult = await spendCreditsForVideo(supabase, userId, battle_id, TIER_1_VIDEO_COST);
          break;
        case 'free_grant':
          legacySpendResult = await spendFreeGrant(supabase, userId, battle_id);
          break;
        default:
          return errorResponse('Invalid entitlement method', 500);
      }
      legacyMethod = entitlementCheck.method;
      if (!legacySpendResult || !legacySpendResult.success) {
        return errorResponse('Failed to process payment/allowance', 500);
      }
    }

    // Unified spend descriptor for downstream video_jobs insert.
    const spendResult: { success: boolean; source: string; transaction_id?: string } | null =
      roundGateResult
        ? {
            success: true,
            source: roundGateResult.source,
            transaction_id: roundGateResult.reservation_id ?? undefined,
          }
        : legacySpendResult;
    const effectiveMethod: string = roundGateResult ? roundGateResult.source : (legacyMethod ?? '');

    if (!spendResult || !spendResult.success) {
      return errorResponse('Failed to process payment/allowance', 500);
    }
    
    // 7. Create video_jobs row with idempotency.
    //    Per-round: compose Tier 1 payload from frozen battle_rounds + prompts,
    //    derive input_payload_hash, and tag with trigger / tier / round metadata.
    const trigger: VideoJobTrigger = battle_round_id
      ? (effectiveMethod === 'subscriber_full' || effectiveMethod === 'subscriber_round'
          ? 'auto_subscriber'
          : effectiveMethod === 'new_user_grant'
          ? 'on_demand_grant'
          : 'on_demand_credit')
      : 'series_end_legacy';

    let inputPayloadHash: string | null = null;
    let composedPayload: Record<string, unknown> | null = null;

    if (battle_round_id) {
      try {
        composedPayload = await composePerRoundPayload(
          supabase,
          battle as Record<string, any>,
          battle_round_id,
          round_number ?? null,
        );
        inputPayloadHash = await hashTier1Payload(composedPayload as any);
      } catch (e) {
        console.error('Tier 1 payload composition failed:', e);
        await rollbackSpend(supabase, spendResult, roundGateResult, userId, battle_id, round_number ?? 1);
        return errorResponse(
          `Failed to compose Tier 1 payload: ${e instanceof Error ? e.message : 'unknown'}`,
          500,
        );
      }
    }

    const requestPayloadHash =
      inputPayloadHash ?? (await hashPayload({ battle_id, userId, timestamp: Date.now() }));
    
    const { data: videoJob, error: jobError } = await supabase
      .from('video_jobs')
      .insert({
        battle_id,
        battle_round_id: battle_round_id ?? null,
        round_number: round_number ?? null,
        tier: 1,
        trigger,
        provider: 'xai',
        status: 'queued',
        request_payload_hash: requestPayloadHash,
        input_payload_hash: inputPayloadHash,
        requester_profile_id: userId,
        entitlement_source: spendResult.source,
        spend_transaction_id: spendResult.transaction_id || null,
        credits_charged:
          effectiveMethod === 'credits' || effectiveMethod === 'credit'
            ? TIER_1_VIDEO_COST
            : 0,
        cost_units: battle_round_id ? TIER1_PER_ROUND_COST_UNITS : 0,
      })
      .select('id, status')
      .single();
    
    if (jobError || !videoJob) {
      console.error('Video job creation failed:', jobError);
      await rollbackSpend(supabase, spendResult, roundGateResult, userId, battle_id, round_number ?? 1);
      return errorResponse('Failed to create video job', 500);
    }
    
    // 8. Update battle status if still result_ready (legacy single-format only;
    //    per-round upgrades MUST NOT toggle battle status — the battle may still
    //    be resolving for the next round.)
    if (!battle_round_id && battle.status === 'result_ready') {
      await supabase
        .from('battles')
        .update({ status: 'generating_video' })
        .eq('id', battle_id);
    }
    // Write back the cinematic_video_job_id so the client's per-round
    // subscription sees the new Tier 1 job immediately (asset_url + tier are
    // updated by the worker once the asset is ready).
    if (battle_round_id) {
      await supabase
        .from('battle_rounds')
        .update({
          cinematic_video_job_id: videoJob.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', battle_round_id);
    }
    
    return successResponse({
      success: true,
      video_job_id: videoJob.id,
      status: videoJob.status,
      entitlement_source: spendResult.source,
      message: 'Video upgrade requested successfully',
    });
    
  } catch (error) {
    console.error('Request video upgrade error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});

/**
 * Check if user is entitled to video upgrade and return method + cost
 */
async function checkVideoUpgradeEntitlement(
  supabase: any,
  userId: string
): Promise<EntitlementCheck> {
  // Query entitlements view
  const { data: entitlement, error } = await supabase
    .from('entitlements')
    .select('*')
    .eq('profile_id', userId)
    .single();
  
  if (error) {
    console.error('Entitlements query error:', error);
    return {
      can_upgrade: false,
      method: 'none',
      error: 'Failed to check entitlements',
    };
  }
  
  // Priority 1: Check for free grant (first 7 days, 3 reveals)
  const freeGrantsRemaining = await checkFreeGrantsRemaining(supabase, userId);
  if (freeGrantsRemaining > 0) {
    return {
      can_upgrade: true,
      method: 'free_grant',
      free_grants_remaining: freeGrantsRemaining,
    };
  }
  
  // Priority 2: Active subscription with remaining allowance
  if (entitlement.is_subscriber && entitlement.monthly_video_allowance_remaining > 0) {
    return {
      can_upgrade: true,
      method: 'subscription_allowance',
      allowance_remaining: entitlement.monthly_video_allowance_remaining,
    };
  }
  
  // Priority 3: Credits balance
  if (entitlement.credits_balance >= TIER_1_VIDEO_COST) {
    return {
      can_upgrade: true,
      method: 'credits',
      cost_credits: TIER_1_VIDEO_COST,
      credits_balance: entitlement.credits_balance,
    };
  }
  
  // No entitlement
  return {
    can_upgrade: false,
    method: 'none',
    credits_balance: entitlement.credits_balance,
    allowance_remaining: entitlement.monthly_video_allowance_remaining || 0,
    free_grants_remaining: 0,
    error: 'Insufficient credits and no active subscription allowance',
  };
}

/**
 * Check remaining free Tier 1 grants (3 in first 7 days for new accounts)
 * Uses profiles.free_tier1_reveals_remaining column
 */
async function checkFreeGrantsRemaining(supabase: any, userId: string): Promise<number> {
  // Get account creation date and free reveals remaining
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('created_at, free_tier1_reveals_remaining')
    .eq('id', userId)
    .single();
  
  if (profileError || !profile) {
    return 0;
  }
  
  const accountAge = Date.now() - new Date(profile.created_at).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  
  // Only eligible in first 7 days
  if (accountAge > sevenDaysMs) {
    return 0;
  }
  
  return Math.max(0, profile.free_tier1_reveals_remaining || 0);
}

/**
 * Spend subscription allowance (decrement monthly_video_allowance_used)
 */
async function spendSubscriptionAllowance(
  supabase: any,
  userId: string,
  battleId: string
): Promise<{ success: boolean; source: string }> {
  // Get active subscription
  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select('id, monthly_video_allowance, monthly_video_allowance_used')
    .eq('profile_id', userId)
    .eq('status', 'active')
    .single();
  
  if (subError || !sub) {
    return { success: false, source: 'subscription_allowance' };
  }
  
  if (sub.monthly_video_allowance_used >= sub.monthly_video_allowance) {
    return { success: false, source: 'subscription_allowance' };
  }
  
  // Increment usage counter
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({ 
      monthly_video_allowance_used: sub.monthly_video_allowance_used + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sub.id);
  
  if (updateError) {
    console.error('Allowance decrement error:', updateError);
    return { success: false, source: 'subscription_allowance' };
  }
  
  return { success: true, source: 'subscription_allowance' };
}

/**
 * Spend credits for video (negative wallet transaction)
 */
async function spendCreditsForVideo(
  supabase: any,
  userId: string,
  battleId: string,
  amount: number
): Promise<{ success: boolean; source: string; transaction_id?: string }> {
  const idempotencyKey = generateIdempotencyKey(['video_upgrade', userId, battleId]);
  
  try {
    const { data, error } = await supabase.rpc('spend_credits', {
      p_profile_id: userId,
      p_amount: amount,
      p_reason: 'video_upgrade',
      p_idempotency_key: idempotencyKey,
      p_battle_id: battleId,
      p_video_job_id: null,
      p_metadata: { tier: 'tier1' },
    });
    
    if (error) {
      console.error('Spend credits error:', error);
      return { success: false, source: 'credits' };
    }
    
    return { success: true, source: 'credits', transaction_id: data };
  } catch (err) {
    console.error('Spend credits exception:', err);
    return { success: false, source: 'credits' };
  }
}

/**
 * Spend free grant using atomic RPC
 * RPC handles decrement, audit transaction, and all validation
 */
async function spendFreeGrant(
  supabase: any,
  userId: string,
  battleId: string
): Promise<{ success: boolean; source: string; transaction_id?: string }> {
  const idempotencyKey = generateIdempotencyKey(['free_tier1_grant', userId, battleId]);
  
  try {
    const { data: transactionId, error } = await supabase.rpc('consume_free_tier1_reveal', {
      p_profile_id: userId,
      p_battle_id: battleId,
      p_idempotency_key: idempotencyKey,
    });
    
    if (error) {
      console.error('consume_free_tier1_reveal RPC error:', error);
      return { success: false, source: 'free_grant' };
    }
    
    // NULL means ineligible (no grants, too old, etc.)
    if (!transactionId) {
      return { success: false, source: 'free_grant' };
    }
    
    return { success: true, source: 'free_grant', transaction_id: transactionId };
  } catch (err) {
    console.error('Free grant exception:', err);
    return { success: false, source: 'free_grant' };
  }
}

/**
 * Hash request payload for idempotency check
 */
async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rollback video spend if job creation fails
 * Handles credits, subscription_allowance, and free_grant sources
 */
async function rollbackSpend(
  supabase: any,
  spendResult: { success: boolean; source: string; transaction_id?: string } | null,
  roundGate: { source: RoundUpgradeSource; reservation_id: string | null; is_full_battle: boolean } | null,
  userId: string,
  battleId: string,
  roundNumber: number,
): Promise<void> {
  if (roundGate) {
    await finalizeRoundUpgradeEntitlement(
      {
        reservation_id: roundGate.reservation_id,
        source: roundGate.source,
        profile_id: userId,
        battle_id: battleId,
        round_number: roundNumber,
        is_full_battle: roundGate.is_full_battle,
      },
      'failed',
      supabase,
    );
    return;
  }
  if (spendResult) {
    await rollbackVideoSpend(supabase, spendResult, userId, battleId);
  }
}

async function rollbackVideoSpend(
  supabase: any,
  spendResult: { success: boolean; source: string; transaction_id?: string },
  userId: string,
  battleId: string
): Promise<void> {
  const rollbackIdempotencyKey = generateIdempotencyKey(['rollback_video_spend', userId, battleId]);
  
  try {
    switch (spendResult.source) {
      case 'credits':
        // Refund credits using grant_credits RPC with idempotency
        if (spendResult.transaction_id) {
          await supabase.rpc('grant_credits', {
            p_profile_id: userId,
            p_amount: TIER_1_VIDEO_COST,
            p_reason: 'video_job_creation_failed_refund',
            p_idempotency_key: rollbackIdempotencyKey,
            p_battle_id: battleId,
            p_purchase_id: null,
            p_metadata: { original_transaction_id: spendResult.transaction_id },
          });
        }
        break;
      
      case 'free_grant':
        // Restore free tier reveal count using RPC
        await supabase.rpc('restore_free_tier1_reveal', {
          p_profile_id: userId,
          p_video_job_id: null, // No job ID yet since creation failed
          p_idempotency_key: rollbackIdempotencyKey,
        });
        break;
      
      case 'subscription_allowance':
        // Restore subscription allowance using RPC
        await supabase.rpc('restore_subscription_allowance', {
          p_profile_id: userId,
          p_video_job_id: null,
          p_idempotency_key: rollbackIdempotencyKey,
        });
        break;
      
      default:
        console.warn('Unknown entitlement source for rollback:', spendResult.source);
    }
  } catch (error) {
    console.error('Rollback error:', error);
    // Log but don't throw - job creation already failed
  }
}
