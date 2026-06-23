// Client-side daily-meta + FTUO API helpers.
// All engagement logic is server-owned; these helpers only invoke Edge
// Functions and surface typed results.

import { supabase } from './supabase';

export interface DailyQuest {
  id: string;
  daily_quest_id: string;
  current_value: number;
  completed: boolean;
  completed_at: string | null;
  quest_date: string;
  quest?: {
    id: string;
    title: string;
    description: string;
    quest_type: string;
    target_value: number;
    reward_credits: number;
    reward_xp: number;
  } | null;
}

export interface DailyMetaState {
  success: boolean;
  login: {
    streak: number;
    claimed_today: boolean;
    mercy_used_this_week: boolean;
  };
  win_streak: {
    current: number;
    best: number;
  };
  quests: DailyQuest[];
}

export interface FirstTimeOffer {
  eligible: boolean;
  reason: string;
  expires_at?: string;
  offer?: {
    slug: string;
    title: string;
    description: string;
    product_id: string;
    credits: number;
    exclusive_cosmetic_slug: string | null;
    price_usd: number | null;
    reference_price_usd: number | null;
  };
}

/**
 * Full daily sync: assigns today's quests, auto-claims the login streak,
 * grants newly-earned cosmetics, and returns the daily-meta state.
 */
export async function syncDailyMeta(): Promise<DailyMetaState | null> {
  const { data, error } = await supabase.functions.invoke('daily-meta', {
    body: { action: 'sync' },
  });
  if (error) {
    console.error('syncDailyMeta error:', error);
    return null;
  }
  return data as DailyMetaState;
}

/**
 * Claim the credit reward for a completed quest.
 */
export async function claimQuest(
  questId: string,
): Promise<{ success: boolean; credits_granted?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke('daily-meta', {
    body: { action: 'claim_quest', quest_id: questId },
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return data;
}

/**
 * Fetch the first-time-user offer for the current player (surfaces it if
 * eligible). Safe to call on every app foreground.
 */
export async function getFirstTimeOffer(): Promise<FirstTimeOffer | null> {
  const { data, error } = await supabase.functions.invoke('first-time-offer', {
    body: { action: 'get' },
  });
  if (error) {
    console.error('getFirstTimeOffer error:', error);
    return null;
  }
  return data as FirstTimeOffer;
}

/**
 * Dismiss the first-time-user offer (a player only ever gets one).
 */
export async function dismissFirstTimeOffer(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('first-time-offer', {
    body: { action: 'dismiss' },
  });
  if (error) {
    console.error('dismissFirstTimeOffer error:', error);
    return false;
  }
  return Boolean((data as { dismissed?: boolean })?.dismissed);
}
