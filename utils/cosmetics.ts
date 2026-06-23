// Client-side cosmetics shop API helpers.
// Cosmetics are strictly cosmetic; all ownership/purchase/equip is server-owned.

import { supabase } from './supabase';

export type CosmeticType =
  | 'frame'
  | 'title'
  | 'avatar_effect'
  | 'reveal_style'
  | 'color'
  | 'badge';

export type CosmeticAcquisition =
  | 'free'
  | 'play_unlock'
  | 'subscription'
  | 'credits'
  | 'exclusive';

export interface CosmeticItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  cosmetic_type: CosmeticType;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  acquisition: CosmeticAcquisition;
  price_credits: number | null;
  min_subscription_tier: string | null;
  unlock_rule: Record<string, number> | null;
  value: string | null;
  preview_asset_path: string | null;
  sort_order: number;
  owned: boolean;
}

export interface CosmeticsCatalog {
  success: boolean;
  items: CosmeticItem[];
  owned_count: number;
}

/**
 * List the cosmetics catalog with ownership flags for the current player.
 */
export async function listCosmetics(): Promise<CosmeticsCatalog | null> {
  const { data, error } = await supabase.functions.invoke('cosmetics', {
    body: { action: 'list' },
  });
  if (error) {
    console.error('listCosmetics error:', error);
    return null;
  }
  return data as CosmeticsCatalog;
}

/**
 * Spend credits to purchase a 'credits' cosmetic. Server validates balance,
 * ownership, and purchasability.
 */
export async function purchaseCosmetic(slug: string): Promise<
  CosmeticsCatalog & { success: boolean; error?: string }
> {
  const { data, error } = await supabase.functions.invoke('cosmetics', {
    body: { action: 'purchase', cosmetic_slug: slug },
  });
  if (error) {
    return {
      success: false,
      error: error.message,
      items: [],
      owned_count: 0,
    };
  }
  return data;
}

/**
 * Equip (or unequip when slug is null) an owned cosmetic on a character.
 */
export async function equipCosmetic(
  characterId: string,
  cosmeticType: CosmeticType,
  slug: string | null,
): Promise<{ success: boolean; error?: string; equipped?: string | null }> {
  const { data, error } = await supabase.functions.invoke('cosmetics', {
    body: {
      action: 'equip',
      character_id: characterId,
      cosmetic_type: cosmeticType,
      cosmetic_slug: slug,
    },
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return data;
}

/**
 * Grant all free / earned / subscription cosmetics the player now qualifies for.
 */
export async function syncCosmetics(): Promise<CosmeticsCatalog | null> {
  const { data, error } = await supabase.functions.invoke('cosmetics', {
    body: { action: 'sync' },
  });
  if (error) {
    console.error('syncCosmetics error:', error);
    return null;
  }
  return data as CosmeticsCatalog;
}
