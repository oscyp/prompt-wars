/**
 * Other players' public presentation: the equipped cosmetics plus the active
 * fighter's archetype and signature colour, read through the
 * `public_player_cosmetics` view.
 *
 * `characters` is owner-only under RLS, so this view is the one place the
 * Rankings, Battles and Arena rows can learn what another fighter looks like
 * without a finished battle's reveal payload. It exposes nothing a battle does
 * not already show every opponent: no name, no battle cry, no prompt, no stats.
 *
 * Resolves, never rejects: an unreadable player is "unknown", which every
 * caller renders as the neutral illustration. A failed read must not blank a
 * leaderboard.
 */

import { supabase } from './supabase';
import { resolveEquippedCosmetics, type EquippedCosmetics } from './cosmetics';

export interface PublicPlayer {
  /** Archetype id (`titan`, `mystic`, …); null when unknown. */
  archetype: string | null;
  /** Signature colour as stored (hex or palette key); null when unknown. */
  signatureColor: string | null;
  cosmetics: EquippedCosmetics;
}

export type PublicPlayerMap = Map<string, PublicPlayer>;

export const PUBLIC_PLAYER_COLUMNS =
  'profile_id, cosmetic_config, archetype, signature_color';

/**
 * The view's original shape. Migrations can lag the client on the remote
 * project; when the identity columns are not there yet the badges must still
 * load, so a failed wide read retries with the narrow one.
 */
export const PUBLIC_PLAYER_LEGACY_COLUMNS = 'profile_id, cosmetic_config';

/** PostgREST `in` filters go in the URL; keep each request comfortably short. */
export const PUBLIC_PLAYER_CHUNK = 100;

interface PublicPlayerRow {
  profile_id: string;
  cosmetic_config?: Record<string, string | null | undefined> | null;
  archetype?: string | null;
  signature_color?: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Splits `items` into consecutive groups of at most `size`. */
export function chunkIds<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function toPublicPlayer(row: PublicPlayerRow): PublicPlayer {
  return {
    archetype: str(row.archetype),
    signatureColor: str(row.signature_color),
    cosmetics: resolveEquippedCosmetics(row.cosmetic_config),
  };
}

async function readChunk(ids: string[]): Promise<PublicPlayerRow[] | null> {
  const wide = await supabase
    .from('public_player_cosmetics')
    .select(PUBLIC_PLAYER_COLUMNS)
    .in('profile_id', ids);
  if (!wide.error) return (wide.data ?? []) as unknown as PublicPlayerRow[];
  console.error('fetchPublicPlayers:', wide.error);

  const narrow = await supabase
    .from('public_player_cosmetics')
    .select(PUBLIC_PLAYER_LEGACY_COLUMNS)
    .in('profile_id', ids);
  if (narrow.error) {
    console.error('fetchPublicPlayers (legacy columns):', narrow.error);
    return null;
  }
  return (narrow.data ?? []) as unknown as PublicPlayerRow[];
}

/**
 * The public presentation of each listed player, keyed by profile id.
 *
 * One `.in()` query per 100 ids. Players the view does not know (no active
 * character) are simply absent. An empty map when nothing could be read; a
 * chunk that fails drops only its own players.
 */
export async function fetchPublicPlayers(
  profileIds: readonly string[],
): Promise<PublicPlayerMap> {
  const map: PublicPlayerMap = new Map();
  const ids = Array.from(new Set(profileIds.filter((id) => Boolean(id))));
  if (ids.length === 0) return map;
  try {
    const results = await Promise.all(
      chunkIds(ids, PUBLIC_PLAYER_CHUNK).map(readChunk),
    );
    for (const rows of results) {
      if (!rows) continue;
      for (const row of rows) {
        if (typeof row.profile_id !== 'string') continue;
        map.set(row.profile_id, toPublicPlayer(row));
      }
    }
  } catch (err) {
    console.error('fetchPublicPlayers:', err);
    return new Map();
  }
  return map;
}
