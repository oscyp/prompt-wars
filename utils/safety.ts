/**
 * Safety and Moderation Service Helpers
 * Minimal client-safe wrappers for report, block, and account guard APIs
 * No provider keys or service-role operations in mobile
 */

import { Platform, Dimensions } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export interface ReportContentParams {
  reportedType: 'battle' | 'video' | 'profile';
  reportedId: string;
  reportedProfileId?: string;
  reason: 'inappropriate' | 'harassment' | 'cheating' | 'spam';
  description?: string;
  applyBlock?: boolean;
}

export interface ReportContentResult {
  reportId: string;
  blocked: boolean;
  message: string;
}

/**
 * Submit a content report
 * Calls report-intake Edge Function
 */
export async function reportContent(
  params: ReportContentParams
): Promise<ReportContentResult> {
  const { data, error } = await supabase.functions.invoke('report-intake', {
    body: {
      reported_type: params.reportedType,
      reported_id: params.reportedId,
      reported_profile_id: params.reportedProfileId,
      reason: params.reason,
      description: params.description,
      apply_block: params.applyBlock,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit report');
  }

  return {
    reportId: data.report_id,
    blocked: data.blocked,
    message: data.message,
  };
}

/**
 * Block another user
 * Calls block-profile Edge Function
 */
export async function blockUser(blockedProfileId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('block-profile', {
    body: { blocked_profile_id: blockedProfileId },
  });

  if (error) {
    throw new Error(error.message || 'Failed to block user');
  }
}

/**
 * Unblock a previously blocked user
 * Calls unblock-profile Edge Function
 */
export async function unblockUser(blockedProfileId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('unblock-profile', {
    body: { blocked_profile_id: blockedProfileId },
  });

  if (error) {
    throw new Error(error.message || 'Failed to unblock user');
  }
}

/**
 * Get list of blocked users for current user
 * Uses direct Supabase query (RLS-protected)
 */
export async function getBlockedUsers(): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocked_profile_id')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch blocked users');
  }

  return data.map((block) => block.blocked_profile_id);
}

export interface AccountGuardParams {
  action: 'signup' | 'ftuo' | 'onboarding_credits';
  deviceFingerprint?: string;
  ipAddress?: string;
  platform?: 'ios' | 'android' | 'web';
  deviceAttestationToken?: string;
}

export interface AccountGuardResult {
  eligible: boolean;
  reason?: string;
  flagged: boolean;
  signals: {
    ipVelocity?: number;
    deviceVelocity?: number;
    ipCountry?: string;
  };
}

/**
 * Check account eligibility for FTUO or onboarding credits
 * Calls account-farm-guard Edge Function (server-owned)
 * 
 * DO NOT call this for every action - only for:
 * - Signup completion (action: 'signup')
 * - FTUO display (action: 'ftuo')
 * - Onboarding credit grant (action: 'onboarding_credits')
 */
export async function checkAccountEligibility(
  params: AccountGuardParams
): Promise<AccountGuardResult> {
  const { data, error } = await supabase.functions.invoke('account-farm-guard', {
    body: {
      action: params.action,
      device_fingerprint: params.deviceFingerprint,
      ip_address: params.ipAddress,
      platform: params.platform,
      device_attestation_token: params.deviceAttestationToken,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to check account eligibility');
  }

  return {
    eligible: data.eligible,
    reason: data.reason,
    flagged: data.flagged,
    signals: data.signals,
  };
}

/**
 * Check if current user has blocked or been blocked by another user
 * Uses is_blocked database function
 */
export async function isUserBlocked(otherProfileId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabase.rpc('is_blocked', {
    p_profile_id: user.id,
    p_other_profile_id: otherProfileId,
  });

  if (error) {
    console.error('Failed to check block status:', error);
    return false;
  }

  return data === true;
}

/**
 * Get device fingerprint for account guard
 * Simple client-side fingerprint (not cryptographically secure)
 * Uses React Native APIs instead of web globals
 */
export function getDeviceFingerprint(): string {
  // Basic fingerprint for MVP using React Native/Expo APIs
  const { width, height } = Dimensions.get('screen');
  const platform = Platform.OS;
  const platformVersion = Platform.Version;
  const deviceName = Constants.deviceName || 'unknown';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  
  // Get native build info if available
  const nativeBuildVersion = Application.nativeBuildVersion || 'unknown';
  const nativeAppVersion = Application.nativeApplicationVersion || 'unknown';

  const fingerprintString = `${platform}|${platformVersion}|${deviceName}|${width}x${height}|${timezone}|${nativeBuildVersion}|${nativeAppVersion}`;

  // Simple hash (not cryptographic)
  let hash = 0;
  for (let i = 0; i < fingerprintString.length; i++) {
    const char = fingerprintString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash.toString(36);
}
