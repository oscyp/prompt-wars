import { archetypeIllustrationUri } from '@/constants/ArchetypeAvatars';
import { presentationFor } from '@/constants/Cosmetics';
import type { CosmeticItem, EquippedCosmetics } from '@/utils/cosmetics';
import type { ShopCharacter } from '@/hooks/useCosmeticShop';
import type { StatBlock } from '@/types/battle';

export const names = [
  'Mira',
  'AleksandraNieprzerwanieDługaNazwaBohaterki',
  'Żaneta Łęcka',
  '星の守護者・アレクサンドラ',
];
export const statCases: StatBlock[] = [
  { strength: 7, stamina: 8, agility: 6, focus: 9 },
  { strength: 1, stamina: 1, agility: 1, focus: 1 },
  { strength: 10, stamina: 10, agility: 10, focus: 10 },
];
export const frameSlugs = [null, 'neon_frame', 'astral_codex_frame'] as const;
export function equipment(index: number): EquippedCosmetics {
  const frame = presentationFor(frameSlugs[index] ?? '');
  return {
    frame: frame?.kind === 'frame' ? frame : null,
    title: null,
    badge: null,
    avatarEffect: null,
  };
}
export function fighter(name: string): ShopCharacter {
  const uri = archetypeIllustrationUri('mystic') ?? '';
  return {
    id: 'local-fixture',
    name,
    signatureColor: '#B69AF8',
    portraitUri: uri,
    avatarUri: uri,
  };
}
const entries = [
  ['astral_codex_frame', 'Astral Codex', 'frame'],
  ['emberforge_frame', 'Emberforge', 'frame'],
  ['neon_circuit_frame', 'Neon Circuit', 'frame'],
  ['laureate_frame', 'Laureate', 'frame'],
  ['champion_title', 'Champion of the Unending Constellation', 'title'],
  ['plus_aura', 'Plus aura', 'avatar_effect'],
  ['streak_badge', 'Streak badge', 'badge'],
  ['galaxy_color', 'Galaxy', 'color'],
] as const;
// Synthetic prices deliberately exercise wrapping; these are NOT the live catalog.
export const catalog: CosmeticItem[] = entries.map(
  ([slug, name, cosmetic_type], index) => ({
    id: `local-${slug}`,
    slug,
    name,
    cosmetic_type,
    description: 'Read-only visual fixture.',
    rarity: index % 2 ? 'epic' : 'legendary',
    acquisition: 'credits',
    price_credits: index === 1 ? 123456789 : 1200,
    min_subscription_tier: null,
    unlock_rule: index === 3 ? { wins: 100 } : null,
    value: null,
    preview_asset_path: null,
    sort_order: index,
    owned: index % 2 === 0,
  }),
);
export const themes = [
  'The Last Library',
  'Protect the last library of forgotten stars while a thousand mechanical dragons rewrite every memory in the city',
];
export const deadline =
  'Tuesday, 15 September 2026 at 23:59:59 Central European Summer Time (UTC+02:00)';
