// Request Video Upgrade Edge Function
// Server-owned video tier upgrade decision: validates entitlements, spends credits/allowance, creates video job

import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  successResponse,
} from '../_shared/utils.ts';
import { hashTier1Payload } from '../_shared/compose-tier1-payload.ts';
import { kickVideoWorker } from '../_shared/auto-video.ts';
import { composePerRoundPayload } from '../_shared/per-round-payload.ts';
import {
  isRetryableFailedJob,
  TIER1_PER_ROUND_COST_UNITS,
  type VideoJobTrigger,
} from '../_shared/video-constants.ts';
import {
  checkRoundUpgradeEntitlement,
  finalizeRoundUpgradeEntitlement,
  type RoundUpgradeSource,
} from '../_shared/entitlement-gate.ts';

interface CinematicPolicy {
  cinematic_profile: 'standard' | 'plus';
  target_duration_seconds: number;
  duration_policy_version: 'cinematics-v2' | 'cinematics-v3' | null;
}
interface RequestVideoUpgradeRequest {
  battle_id: string;
  auto_spend?: boolean;
  battle_round_id?: string;
  round_number?: number; // Accepted for compatibility; authoritative row wins.
  expected_cinematic_policy?: CinematicPolicy;
  expected_funding_quote?: { method: string; cost_credits: number };
}
interface EntitlementCheck {
  can_upgrade: boolean;
  method:
    | 'subscription_allowance'
    | 'credits'
    | 'free_grant'
    | 'none'
    | RoundUpgradeSource;
  cost_credits?: number;
  allowance_remaining?: number;
  credits_balance?: number;
  free_grants_remaining?: number;
  error?: string;
}
const TIER_1_VIDEO_COST = 1;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const userId = await getAuthUserId(req, { capability: 'generate' });
    const {
      battle_id,
      auto_spend = false,
      battle_round_id,
      expected_cinematic_policy,
      expected_funding_quote,
    }: RequestVideoUpgradeRequest = await req.json();
    if (!battle_id) return errorResponse('battle_id required');
    const supabase = createServiceClient();
    const { data: battleRaw, error: battleError } = await supabase
      .from('battles')
      .select(
        battle_round_id
          ? '*, player_one_character:characters!battles_player_one_character_id_fkey(*), player_two_character:characters!battles_player_two_character_id_fkey(*)'
          : 'id, status, format, player_one_id, player_two_id',
      )
      .eq('id', battle_id)
      .single();
    const battle = battleRaw as any;
    if (battleError || !battle) return errorResponse('Battle not found', 404);
    if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
      return errorResponse('Not a participant in this battle', 403);
    }
    if (battle.format === 'bo3' && !battle_round_id) {
      return errorResponse('battle_round_id required for Bo3', 400);
    }
    let roundNumber: number | null = null;
    if (battle_round_id) {
      const { data: round, error } = await supabase
        .from('battle_rounds')
        .select('id, status, battle_id, round_number')
        .eq('id', battle_round_id)
        .single();
      if (error || !round) {
        return errorResponse('battle_round_id not found', 404);
      }
      if (round.battle_id !== battle_id) {
        return errorResponse(
          'battle_round_id does not belong to battle_id',
          400,
        );
      }
      if (round.status !== 'result_ready') {
        return errorResponse(
          `Round not ready for upgrade. Round status: ${round.status}`,
          400,
        );
      }
      if (
        !Number.isInteger(round.round_number) ||
        round.round_number < 1 ||
        round.round_number > 3
      )
        return errorResponse('Invalid recorded round_number', 500);
      roundNumber = round.round_number;
    } else if (!['result_ready', 'completed'].includes(battle.status)) {
      return errorResponse(
        `Battle not ready for video upgrade. Status: ${battle.status}`,
        400,
      );
    }
    let existingQuery = supabase
      .from('video_jobs')
      .select(
        'id, status, refunded, error_code, trigger, cinematic_profile, target_duration_seconds, duration_policy_version',
      )
      .eq('battle_id', battle_id)
      .eq('tier', 1);
    existingQuery = battle_round_id
      ? existingQuery.eq('battle_round_id', battle_round_id)
      : existingQuery.is('battle_round_id', null);
    const { data: existingJobs, error: existingError } = await existingQuery;
    if (existingError) {
      return errorResponse('Failed to check existing video jobs', 500);
    }
    const blockingJob = (existingJobs ?? []).find(
      (job) => !isRetryableFailedJob(job),
    );
    if (blockingJob) {
      if (battle_round_id) {
        return errorResponse(
          `Tier 1 already requested for this round (job ${blockingJob.id}, status ${blockingJob.status})`,
          409,
        );
      }
      return successResponse({
        already_requested: true,
        video_job_id: blockingJob.id,
        status: blockingJob.status,
        cinematic_profile: blockingJob.cinematic_profile,
        target_duration_seconds: blockingJob.target_duration_seconds,
        duration_policy_version: blockingJob.duration_policy_version,
      });
    }
    const gateContext = {
      battle: {
        id: battle.id,
        format: battle.format ?? 'single',
        best_of: battle.best_of ?? 1,
        player_one_rounds_won: battle.player_one_rounds_won ?? 0,
        player_two_rounds_won: battle.player_two_rounds_won ?? 0,
      },
    };
    const readQuote = async () => {
      const { data: policy, error } = await supabase.rpc(
        'resolve_cinematic_policy',
        { p_battle_id: battle_id },
      );
      if (
        error ||
        !policy ||
        !['standard', 'plus'].includes(policy.cinematic_profile) ||
        ![8, 12, 15, 20].includes(policy.target_duration_seconds) ||
        ![null, 'cinematics-v2', 'cinematics-v3'].includes(
          policy.duration_policy_version,
        )
      )
        throw new Error('Failed to resolve cinematic policy');
      let entitlement: EntitlementCheck;
      if (battle_round_id) {
        const gate = await checkRoundUpgradeEntitlement(
          userId,
          battle_id,
          roundNumber!,
          supabase as any,
          { ...gateContext, previewOnly: true },
        );
        entitlement = {
          can_upgrade: gate.allowed && Boolean(gate.source),
          method: gate.source ?? 'none',
          cost_credits: gate.source === 'credit' ? TIER_1_VIDEO_COST : 0,
          ...(gate.reason ? { error: gate.reason } : {}),
        };
      } else {
        entitlement = await checkVideoUpgradeEntitlement(supabase, userId);
        entitlement.cost_credits ??= 0;
      }
      return {
        policy: policy as CinematicPolicy,
        entitlement: { ...entitlement, ...policy },
      };
    };
    const quoteChanged = async () => {
      const fresh = await readQuote();
      return successResponse({
        can_upgrade: false,
        quote_changed: true,
        entitlement_check: fresh.entitlement,
        message:
          'Review the updated cinematic length and funding before confirming again.',
      });
    };
    const { policy, entitlement: entitlementCheck } = await readQuote();
    const fundingMatches = (method: string, cost: number) =>
      !expected_funding_quote ||
      (expected_funding_quote.method === method &&
        expected_funding_quote.cost_credits === cost);
    const policyMatches =
      !expected_cinematic_policy ||
      (expected_cinematic_policy.cinematic_profile ===
        policy.cinematic_profile &&
        expected_cinematic_policy.target_duration_seconds ===
          policy.target_duration_seconds &&
        expected_cinematic_policy.duration_policy_version ===
          policy.duration_policy_version);
    if (
      auto_spend &&
      (!policyMatches ||
        !fundingMatches(
          entitlementCheck.method,
          entitlementCheck.cost_credits ?? 0,
        ))
    ) {
      return successResponse({
        can_upgrade: false,
        quote_changed: true,
        entitlement_check: entitlementCheck,
        message:
          'Review the updated cinematic length and funding before confirming again.',
      });
    }
    if (!entitlementCheck.can_upgrade || !auto_spend) {
      return successResponse({
        can_upgrade: entitlementCheck.can_upgrade,
        entitlement_check: entitlementCheck,
        cost_preview: {
          method: entitlementCheck.method,
          cost_credits: entitlementCheck.cost_credits,
        },
        message:
          entitlementCheck.error ??
          'Call again with auto_spend=true to confirm.',
      });
    }

    // Preview is strictly read-only, including refunded failures. Clear retry rows
    // only after confirmation matches, before making the replacement request.
    const failedIds = (existingJobs ?? [])
      .filter(isRetryableFailedJob)
      .map((job) => job.id);
    if (failedIds.length) {
      const { error } = await supabase
        .from('video_jobs')
        .delete()
        .in('id', failedIds);
      if (error) return errorResponse('Failed to prepare video retry', 500);
    }
    let roundGateResult: {
      source: RoundUpgradeSource;
      reservation_id: string | null;
      is_full_battle: boolean;
    } | null = null;
    let spendResult: {
      success: boolean;
      source: string;
      transaction_id?: string;
    } | null = null;
    let effectiveMethod: string;
    if (battle_round_id) {
      const gate = await checkRoundUpgradeEntitlement(
        userId,
        battle_id,
        roundNumber!,
        supabase as any,
        { ...gateContext, reservationAttemptId: crypto.randomUUID() },
      );
      if (!gate.allowed || !gate.source) {
        if (gate.reason === 'upgrade_in_progress') {
          return successResponse({
            can_upgrade: false,
            request_in_progress: true,
            error: 'Another cinematic request is finishing. Please try again.',
          });
        }
        return await quoteChanged();
      }
      roundGateResult = {
        source: gate.source,
        reservation_id: gate.reservation_id ?? null,
        is_full_battle: Boolean(gate.is_full_battle),
      };
      spendResult = {
        success: true,
        source: gate.source,
        transaction_id: gate.reservation_id ?? undefined,
      };
      effectiveMethod = gate.source;
      // The atomic reservation can discover a grant/credit race after preview.
      if (
        !fundingMatches(
          gate.source,
          gate.source === 'credit' ? TIER_1_VIDEO_COST : 0,
        ) ||
        gate.source !== entitlementCheck.method
      ) {
        await rollbackSpend(
          supabase,
          spendResult,
          roundGateResult,
          userId,
          battle_id,
          roundNumber!,
        );
        return await quoteChanged();
      }
    } else {
      effectiveMethod = entitlementCheck.method;
      // Funding and job creation are atomic for single battles. No client-visible
      // quote can debit a bare allowance or leave an orphan legacy transaction.
      spendResult = { success: true, source: entitlementCheck.method };
    }
    if (!spendResult?.success) {
      return errorResponse('Failed to process payment/allowance', 500);
    }
    const trigger: VideoJobTrigger = battle_round_id
      ? effectiveMethod === 'subscriber_full' ||
        effectiveMethod === 'subscriber_round'
        ? 'auto_subscriber'
        : effectiveMethod === 'new_user_grant'
          ? 'on_demand_grant'
          : 'on_demand_credit'
      : 'series_end_legacy';
    let inputPayloadHash: string | null = null;
    // New-policy inputs are composed and stored exactly once under the worker
    // lease. Retain legacy composition only for jobs outside that rollout.
    if (battle_round_id && policy.duration_policy_version === null) {
      try {
        const composed = await composePerRoundPayload(
          supabase,
          battle,
          battle_round_id,
          roundNumber,
        );
        inputPayloadHash = await hashTier1Payload(composed as any);
      } catch (error) {
        await rollbackSpend(
          supabase,
          spendResult,
          roundGateResult,
          userId,
          battle_id,
          roundNumber!,
        );
        return errorResponse(
          `Failed to compose Tier 1 payload: ${
            error instanceof Error ? error.message : 'unknown'
          }`,
          500,
        );
      }
    }
    const jobPayload = {
      battle_id,
      battle_round_id: battle_round_id ?? null,
      round_number: roundNumber,
      tier: 1,
      trigger,
      provider: 'xai',
      status: 'queued',
      request_payload_hash:
        inputPayloadHash ??
        (await hashPayload({ battle_id, userId, timestamp: Date.now() })),
      input_payload_hash: inputPayloadHash,
      requester_profile_id: userId,
      entitlement_source: spendResult.source,
      spend_transaction_id: spendResult.transaction_id ?? null,
      credits_charged:
        effectiveMethod === 'credits' || effectiveMethod === 'credit'
          ? TIER_1_VIDEO_COST
          : 0,
      cost_units: battle_round_id ? TIER1_PER_ROUND_COST_UNITS : 0,
      ...(!battle_round_id
        ? {
            expected_funding_quote: {
              method: entitlementCheck.method,
              cost_credits: entitlementCheck.cost_credits ?? 0,
            },
          }
        : {}),
    };
    const { data: videoJob, error: jobError } = await supabase.rpc(
      'insert_cinematic_video_job',
      { p_job: jobPayload, p_expected_policy: policy },
    );
    if (jobError || !videoJob) {
      await rollbackSpend(
        supabase,
        spendResult,
        roundGateResult,
        userId,
        battle_id,
        roundNumber ?? 1,
      );
      if (jobError?.message?.includes('cinematic_quote_changed')) {
        return await quoteChanged();
      }
      console.error('Video job creation failed:', jobError);
      return errorResponse('Failed to create video job', 500);
    }
    // A Tier 1 job never reopens the authoritative Tier 0 battle state.
    if (battle_round_id) {
      await supabase
        .from('battle_rounds')
        .update({
          cinematic_video_job_id: videoJob.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', battle_round_id);
    }
    const kickTask = kickVideoWorker(videoJob.id);
    // @ts-ignore EdgeRuntime is provided by Supabase in production.
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore EdgeRuntime is provided by Supabase in production.
      EdgeRuntime.waitUntil(kickTask);
    } else await kickTask;
    return successResponse({
      success: true,
      video_job_id: videoJob.id,
      status: videoJob.status,
      entitlement_source: spendResult.source,
      cinematic_profile: videoJob.cinematic_profile,
      target_duration_seconds: videoJob.target_duration_seconds,
      duration_policy_version: videoJob.duration_policy_version,
      message: 'Video upgrade requested successfully',
    });
  } catch (error) {
    console.error('Request video upgrade error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});

/**
 * Check if user is entitled to video upgrade and return method + cost
 */
async function checkVideoUpgradeEntitlement(
  supabase: any,
  userId: string,
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
  if (
    entitlement.is_subscriber &&
    entitlement.monthly_video_allowance_remaining > 0
  ) {
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
async function checkFreeGrantsRemaining(
  supabase: any,
  userId: string,
): Promise<number> {
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
 * Hash request payload for idempotency check
 */
async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Rollback video spend if job creation fails
 * Round funding is a held reservation; single funding rolls back with insertion.
 */
async function rollbackSpend(
  supabase: any,
  _spendResult: {
    success: boolean;
    source: string;
    transaction_id?: string;
  } | null,
  roundGate: {
    source: RoundUpgradeSource;
    reservation_id: string | null;
    is_full_battle: boolean;
  } | null,
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
}
