// Round-unit entitlement gate (Bo3 Tier 1 video upgrades).
//
// Single source of truth for "may this profile spawn a Tier 1 video for this
// round?" decisions. Producer: request-video-upgrade. Consumer (terminal-state
// finalize): process-video-job worker (owned by AI video executor).
//
// Anti-pay-to-win invariant: NOTHING in this module reads or writes judge,
// stats, HP, damage, or scoring data. The gate observes only:
//   - profile_id (identity)
//   - battle_id + round_number (idempotency key)
//   - subscriber state, credit balance, grant tokens, global cost circuit.
// The judge pipeline (see _shared/judge.ts) is invoked with exclusively:
//   prompts, archetypes, move_types, stats snapshot, hp — never any field
//   sourced from `subscriptions`, `wallet_transactions`, or `purchases`.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type RoundUpgradeSource =
  | 'subscriber_full'
  | 'subscriber_round'
  | 'credit'
  | 'new_user_grant';

export interface RoundEntitlementResult {
  allowed: boolean;
  source: RoundUpgradeSource | null;
  reason?: string;
  reservation_id?: string | null;
  is_full_battle?: boolean;
}

export interface RoundEntitlementContext {
  /** Pre-fetched battle row (avoids re-querying); pass minimally needed fields. */
  battle?: {
    id: string;
    format: 'single' | 'bo3';
    best_of: number;
    player_one_rounds_won?: number | null;
    player_two_rounds_won?: number | null;
  };
}

// Global daily Tier 1 spend circuit breaker. Tunable later via remote config;
// kept as a constant for now so it ships with no infra dependency.
export const DAILY_TIER1_SUCCESS_CIRCUIT_THRESHOLD = 500;

/**
 * Check whether a given profile may upgrade a specific round to Tier 1.
 * For credit/grant paths, reserves the resource (hold row). Subscriber path
 * does NOT decrement here — that happens in `decrement_subscriber_round_allowance`
 * after the video job confirms success.
 */
export async function checkRoundUpgradeEntitlement(
  profileId: string,
  battleId: string,
  roundNumber: number,
  client: SupabaseClient,
  ctx: RoundEntitlementContext = {},
): Promise<RoundEntitlementResult> {
  if (roundNumber < 1 || roundNumber > 3) {
    return { allowed: false, source: null, reason: 'invalid_round_number' };
  }

  // 1. Load entitlements_v2 row.
  const { data: ent, error: entErr } = await client
    .from('entitlements_v2')
    .select(
      'is_subscriber, monthly_round_allowance_remaining, monthly_full_battle_cap_remaining, new_user_round_grants_remaining, new_user_grant_per_battle_limit, credits_balance',
    )
    .eq('profile_id', profileId)
    .maybeSingle();

  if (entErr || !ent) {
    return { allowed: false, source: null, reason: 'entitlements_unavailable' };
  }

  const idemBase = `round_upgrade:${battleId}:${roundNumber}:${profileId}`;

  // 2. Subscriber path (no reservation; decrement on success).
  if (ent.is_subscriber) {
    const circuitOpen = await isDailyCostCircuitOpen(client);
    const isFullBattleCandidate = roundNumber === 1;

    if (isFullBattleCandidate && (ent.monthly_full_battle_cap_remaining ?? 0) > 0) {
      // Cap allows whole-battle auto-cinematic.
      if (circuitOpen && !isDecidingRound(roundNumber, ctx.battle)) {
        // Circuit breaker downgrades subscriber to deciding-round-only.
        return {
          allowed: false,
          source: null,
          reason: 'daily_cost_circuit_open_subscriber_downgraded',
        };
      }
      return {
        allowed: true,
        source: 'subscriber_full',
        reservation_id: null,
        is_full_battle: true,
      };
    }

    if ((ent.monthly_round_allowance_remaining ?? 0) > 0) {
      if (circuitOpen && !isDecidingRound(roundNumber, ctx.battle)) {
        return {
          allowed: false,
          source: null,
          reason: 'daily_cost_circuit_open_subscriber_downgraded',
        };
      }
      return {
        allowed: true,
        source: 'subscriber_round',
        reservation_id: null,
        is_full_battle: false,
      };
    }
    // Fall through to credit / grant for subscribers that exhausted allowance.
  }

  // 3. New-user grant path (per-battle limit enforced inside RPC).
  if ((ent.new_user_round_grants_remaining ?? 0) > 0) {
    const grantRes = await client.rpc('reserve_round_upgrade_grant', {
      p_profile_id: profileId,
      p_battle_id: battleId,
      p_round_number: roundNumber,
      p_idempotency_key: `${idemBase}:grant`,
    });
    if (!grantRes.error && grantRes.data) {
      return {
        allowed: true,
        source: 'new_user_grant',
        reservation_id: grantRes.data as string,
        is_full_battle: false,
      };
    }
    // If grant path returned a known business error, fall through to credits.
    if (
      grantRes.error &&
      !/per_battle_grant_limit_reached|no_grants_remaining|grant_expired/.test(
        grantRes.error.message ?? '',
      )
    ) {
      console.error('reserve_round_upgrade_grant error:', grantRes.error);
    }
  }

  // 4. Credit path.
  if ((ent.credits_balance ?? 0) >= 1) {
    const creditRes = await client.rpc('reserve_round_upgrade_credit', {
      p_profile_id: profileId,
      p_battle_id: battleId,
      p_round_number: roundNumber,
      p_idempotency_key: `${idemBase}:credit`,
    });
    if (!creditRes.error && creditRes.data) {
      return {
        allowed: true,
        source: 'credit',
        reservation_id: creditRes.data as string,
        is_full_battle: false,
      };
    }
    if (creditRes.error) {
      console.error('reserve_round_upgrade_credit error:', creditRes.error);
    }
  }

  return {
    allowed: false,
    source: null,
    reason: 'insufficient_entitlement',
  };
}

/**
 * Finalize a previously-checked entitlement. Called by process-video-job on
 * terminal state. Subscriber path passes reservation_id=null + the original
 * source/battle/round so the function can decrement counters on success only.
 */
export async function finalizeRoundUpgradeEntitlement(
  args: {
    reservation_id: string | null;
    source: RoundUpgradeSource;
    profile_id: string;
    battle_id: string;
    round_number: number;
    is_full_battle?: boolean;
  },
  outcome: 'succeeded' | 'failed' | 'moderation_failed',
  client: SupabaseClient,
): Promise<void> {
  // Subscriber: no hold to finalize; decrement counters only on success.
  if (args.source === 'subscriber_full' || args.source === 'subscriber_round') {
    if (outcome !== 'succeeded') return; // do not decrement on failure
    const isFullBattle = args.source === 'subscriber_full' || !!args.is_full_battle;
    const idemKey = `sub_decr:${args.battle_id}:${args.round_number}:${args.profile_id}`;
    const { error } = await client.rpc('decrement_subscriber_round_allowance', {
      p_profile_id: args.profile_id,
      p_battle_id: args.battle_id,
      p_round_number: args.round_number,
      p_is_full_battle: isFullBattle,
      p_idempotency_key: idemKey,
    });
    if (error) {
      console.error('decrement_subscriber_round_allowance error:', error);
    }
    return;
  }

  // Credit / grant path: finalize the held row.
  if (!args.reservation_id) {
    console.warn('finalizeRoundUpgradeEntitlement: missing reservation_id for', args.source);
    return;
  }
  const { error } = await client.rpc('finalize_round_upgrade', {
    p_reservation_id: args.reservation_id,
    p_outcome: outcome,
  });
  if (error) {
    console.error('finalize_round_upgrade error:', error);
  }
}

// ----------------------------------------------------------------------------

function isDecidingRound(
  roundNumber: number,
  battle?: RoundEntitlementContext['battle'],
): boolean {
  if (!battle) return roundNumber === 3;
  if (battle.format !== 'bo3') return true;
  if (roundNumber === 3) return true;
  // Round 2 is "deciding" only if one player already lost a round.
  const p1 = battle.player_one_rounds_won ?? 0;
  const p2 = battle.player_two_rounds_won ?? 0;
  if (roundNumber === 2 && (p1 === 1 || p2 === 1)) return true;
  return false;
}

async function isDailyCostCircuitOpen(client: SupabaseClient): Promise<boolean> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await client
    .from('video_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'succeeded')
    .gte('completed_at', since.toISOString());
  if (error) {
    // Fail closed on counters is too aggressive; fail open is fine here since
    // the gate has no PII / safety component.
    return false;
  }
  return (count ?? 0) >= DAILY_TIER1_SUCCESS_CIRCUIT_THRESHOLD;
}
