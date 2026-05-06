// Client-side monetization API helpers
// Calls server-owned Edge Functions, never grants entitlements client-side

import { supabase } from './supabase';

/**
 * Entitlement check result from server
 */
export interface EntitlementCheck {
  can_upgrade: boolean;
  method: 'subscription_allowance' | 'credits' | 'free_grant' | 'none';
  cost_credits?: number;
  allowance_remaining?: number;
  credits_balance?: number;
  free_grants_remaining?: number;
  error?: string;
}

/**
 * Video upgrade request result
 */
export interface VideoUpgradeResult {
  success: boolean;
  video_job_id?: string;
  status?: string;
  entitlement_source?: string;
  can_upgrade?: boolean;
  entitlement_check?: EntitlementCheck;
  already_requested?: boolean;
  message?: string;
  error?: string;
}

/**
 * Wallet balance from entitlements view
 */
export interface WalletBalance {
  credits_balance: number;
  is_subscriber: boolean;
  subscription_tier?: string;
  monthly_video_allowance_remaining: number;
  priority_queue: boolean;
  cosmetic_unlocks: string[];
}

/**
 * Request video upgrade for a battle (server-owned decision)
 * @param battleId - Battle ID to upgrade
 * @param autoSpend - If false, returns cost preview only
 */
export async function requestVideoUpgrade(
  battleId: string,
  autoSpend = false
): Promise<VideoUpgradeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('request-video-upgrade', {
      body: {
        battle_id: battleId,
        auto_spend: autoSpend,
      },
    });

    if (error) {
      console.error('Video upgrade request error:', error);
      return {
        success: false,
        error: error.message || 'Failed to request video upgrade',
      };
    }

    return {
      success: data.success ?? false,
      video_job_id: data.video_job_id,
      status: data.status,
      entitlement_source: data.entitlement_source,
      can_upgrade: data.can_upgrade,
      entitlement_check: data.entitlement_check,
      already_requested: data.already_requested,
      message: data.message,
    };
  } catch (err) {
    console.error('Video upgrade exception:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get current wallet balance and entitlements (read-only, server-owned)
 */
export async function getWalletBalance(): Promise<WalletBalance | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('entitlements')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (error) {
      console.error('Entitlements query error:', error);
      return null;
    }

    return {
      credits_balance: data.credits_balance || 0,
      is_subscriber: data.is_subscriber || false,
      subscription_tier: data.subscription_tier,
      monthly_video_allowance_remaining: data.monthly_video_allowance_remaining || 0,
      priority_queue: data.priority_queue || false,
      cosmetic_unlocks: data.cosmetic_unlocks || [],
    };
  } catch (err) {
    console.error('Get wallet balance exception:', err);
    return null;
  }
}

/**
 * Get wallet transaction history
 */
export async function getWalletTransactions(limit = 50) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Wallet transactions query error:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Get wallet transactions exception:', err);
    return [];
  }
}

/**
 * Grant credits (server-owned, for daily login, quests, etc.)
 */
export async function grantCredits(reason: string, amount?: number, metadata?: Record<string, unknown>) {
  try {
    const { data, error } = await supabase.functions.invoke('grant-credits', {
      body: {
        reason,
        amount,
        ...metadata,
      },
    });

    if (error) {
      console.error('Grant credits error:', error);
      return { success: false, error: error.message };
    }

    return { success: true, ...data };
  } catch (err) {
    console.error('Grant credits exception:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
