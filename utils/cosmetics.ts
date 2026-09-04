// Client-side cosmetics shop API helpers.
// Cosmetics are strictly cosmetic; all ownership/purchase/equip is server-owned.

import { invokeFunctionResult } from './supabase';

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
  const { data, error } = await invokeFunctionResult('cosmetics', {
    action: 'list',
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
export async function purchaseCosmetic(
  slug: string,
): Promise<CosmeticsCatalog & { success: boolean; error?: string }> {
  const { data, error } = await invokeFunctionResult<
    CosmeticsCatalog & { success: boolean; error?: string }
  >('cosmetics', { action: 'purchase', cosmetic_slug: slug });
  if (error) {
    return {
      success: false,
      error: error.message,
      items: [],
      owned_count: 0,
    };
  }
  // `data` is nullable now that the call goes through the typed wrapper. It was
  // implicitly `any` before, so a null body silently became a "successful"
  // result object with undefined fields.
  return (
    data ?? {
      success: false,
      error: 'Empty response',
      items: [],
      owned_count: 0,
    }
  );
}

/**
 * Equip (or unequip when slug is null) an owned cosmetic on a character.
 */
export async function equipCosmetic(
  characterId: string,
  cosmeticType: CosmeticType,
  slug: string | null,
): Promise<{ success: boolean; error?: string; equipped?: string | null }> {
  const { data, error } = await invokeFunctionResult<{
    success: boolean;
    error?: string;
    equipped?: string | null;
  }>('cosmetics', {
    action: 'equip',
    character_id: characterId,
    cosmetic_type: cosmeticType,
    cosmetic_slug: slug,
  });
  if (error) {
    return { success: false, error: error.message };
  }
  return data ?? { success: false, error: 'Empty response' };
}

/**
 * Grant all free / earned / subscription cosmetics the player now qualifies for.
 */
export async function syncCosmetics(): Promise<CosmeticsCatalog | null> {
  const { data, error } = await invokeFunctionResult('cosmetics', {
    action: 'sync',
  });
  if (error) {
    console.error('syncCosmetics error:', error);
    return null;
  }
  return data as CosmeticsCatalog;
}

// ---------------------------------------------------------------------------
// Equipped cosmetics
// ---------------------------------------------------------------------------

import {
  presentationFor,
  type CosmeticPresentation,
  type FramePresentation,
  type TitlePresentation,
  type BadgePresentation,
  type AvatarEffectPresentation,
} from '@/constants/Cosmetics';

/**
 * `characters.cosmetic_config` as stored: cosmetic_type -> slug.
 *
 * Written only by the `equip_cosmetic` Postgres function, which validates
 * ownership. Treat it as untrusted for *display* purposes anyway — the registry
 * may not know a slug that a future catalogue row introduces.
 */
export type CosmeticConfig = Record<string, string | null | undefined>;

export interface EquippedCosmetics {
  frame: FramePresentation | null;
  title: TitlePresentation | null;
  badge: BadgePresentation | null;
  avatarEffect: AvatarEffectPresentation | null;
}

export const NO_COSMETICS: EquippedCosmetics = {
  frame: null,
  title: null,
  badge: null,
  avatarEffect: null,
};

/**
 * Turns the raw config into the presentations the UI can render.
 *
 * Unknown or mismatched slugs resolve to `null` rather than throwing: a
 * cosmetic the client has not shipped support for yet must degrade to "no
 * frame", never to a crashed battle screen. `reveal_style` is intentionally
 * absent — it has no display surface yet.
 */
export function resolveEquippedCosmetics(
  config: CosmeticConfig | null | undefined,
): EquippedCosmetics {
  if (!config) return NO_COSMETICS;

  // Guard the kind as well as the lookup: a config pairing a type with another
  // type's slug would otherwise render a title's fields as a frame.
  const of = <K extends CosmeticPresentation['kind']>(
    type: string,
    kind: K,
  ): Extract<CosmeticPresentation, { kind: K }> | null => {
    const presentation = presentationFor(config[type]);
    if (!presentation || presentation.kind !== kind) return null;
    return presentation as Extract<CosmeticPresentation, { kind: K }>;
  };

  return {
    frame: of('frame', 'frame'),
    title: of('title', 'title'),
    badge: of('badge', 'badge'),
    avatarEffect: of('avatar_effect', 'avatar_effect'),
  };
}

/**
 * Signature-colour swatches the player has unlocked by owning `color`
 * cosmetics.
 *
 * A colour cosmetic deliberately does NOT apply itself. `signature_color` feeds
 * the portrait prompt, so equipping one automatically would bump
 * appearance_version and tell the player their portrait is out of date --
 * turning a 10-credit cosmetic into a prompt to spend 3 more on a re-render
 * they never asked for. Owning it unlocks the swatch; wearing it stays a
 * deliberate, free choice in the Identity tab.
 */
export function unlockedColorSwatches(
  items: CosmeticItem[],
): { value: string; label: string; hex: string }[] {
  return items
    .filter((item) => item.owned && item.cosmetic_type === 'color')
    .map((item) => {
      const presentation = presentationFor(item.slug);
      if (!presentation || presentation.kind !== 'color') return null;
      return {
        value: presentation.hex,
        label: presentation.label,
        hex: presentation.hex,
      };
    })
    .filter(
      (v): v is { value: string; label: string; hex: string } => v !== null,
    );
}
