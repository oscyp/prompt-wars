/**
 * Thin Supabase reads behind the Profile tab.
 *
 * Every fetcher resolves — it never rejects — so the screen can settle them
 * in one `Promise.allSettled` and flag sections individually. A `null` result
 * means "the read failed". The screen renders that as a retryable error, never
 * as a fact: a failed rankings read must not turn a ranked player into
 * "Unranked", and a failed battles read must not print a 0–0 rival record.
 *
 * Nothing here writes. Rated-ness comes from the player's own battles because
 * `profiles.last_rated_at` is not client-readable, and the login streak comes
 * from `syncDailyMeta()` because `daily_login_streak` is not either.
 */

import { supabase } from './supabase';
import { PUBLIC_PROFILE_COLUMNS } from './profiles';
import { listSignatureItemsCatalog } from './characters';
import type { RivalSummary } from './battles';
import {
  rivalIdentityFromBattles,
  rivalRecord,
  type RivalBattleLike,
  type RivalIdentity,
  type RivalRecord,
  type SeasonRankView,
} from './profileView';

// ---------------------------------------------------------------------------
// Row types (client-readable columns only)
// ---------------------------------------------------------------------------

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  rating: number | null;
  level: number | null;
  xp: number | null;
  total_battles: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  current_streak: number | null;
  best_streak: number | null;
  created_at: string | null;
}

export interface ActiveCharacterRow {
  id: string;
  name: string | null;
  archetype: string | null;
  battle_cry: string | null;
  signature_color: string | null;
  signature_item_id: string | null;
  stat_strength: number | null;
  stat_stamina: number | null;
  stat_agility: number | null;
  stat_focus: number | null;
  portrait_id: string | null;
  avatar_portrait_id: string | null;
  cosmetic_config: Record<string, string> | null;
}

export const ACTIVE_CHARACTER_COLUMNS = [
  'id',
  'name',
  'archetype',
  'battle_cry',
  'signature_color',
  'signature_item_id',
  'stat_strength',
  'stat_stamina',
  'stat_agility',
  'stat_focus',
  'portrait_id',
  'avatar_portrait_id',
  'cosmetic_config',
].join(', ');

export const RIVAL_BATTLE_COLUMNS = [
  'status',
  'winner_id',
  'is_draw',
  'player_one_id',
  'player_two_id',
  'created_at',
  'tier0_reveal_payload',
].join(', ');

export const RIVAL_BATTLE_LIMIT = 100;

/** Only `.or()` filter values we built ourselves: ids must look like uuids. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchProfileRow(
  userId: string,
): Promise<ProfileRow | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq('id', userId)
      .single();
    if (error) {
      console.error('fetchProfileRow:', error);
      return null;
    }
    return (data as unknown as ProfileRow | null) ?? null;
  } catch (err) {
    console.error('fetchProfileRow:', err);
    return null;
  }
}

export async function fetchActiveCharacter(
  userId: string,
): Promise<ActiveCharacterRow | null> {
  try {
    const { data, error } = await supabase
      .from('characters')
      .select(ACTIVE_CHARACTER_COLUMNS)
      .eq('profile_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) {
      console.error('fetchActiveCharacter:', error);
      return null;
    }
    return (data as unknown as ActiveCharacterRow | null) ?? null;
  } catch (err) {
    console.error('fetchActiveCharacter:', err);
    return null;
  }
}

/**
 * Has the player finished a ranked battle against a human? That is what moves
 * a rating (`isRatedBattle` in profileView). `null` when the read failed, so
 * the screen can say "couldn't load" instead of "Unrated".
 */
export async function fetchHasRatedBattle(
  userId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('battles')
      .select('id')
      .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`)
      .eq('mode', 'ranked')
      .eq('status', 'completed')
      .eq('is_player_two_bot', false)
      .limit(1);
    if (error) {
      console.error('fetchHasRatedBattle:', error);
      return null;
    }
    return ((data as unknown[] | null) ?? []).length > 0;
  } catch (err) {
    console.error('fetchHasRatedBattle:', err);
    return null;
  }
}

/**
 * The active season and the viewer's row in it. Same query shape as the
 * Rankings tab: `rankings` is UNIQUE on (profile_id, season_id), so the row
 * must be filtered by the active season or two seasons interleave.
 *
 * - No active season → `{ rank: null, seasonName: null, endsAt: null }`.
 * - Active season but no row for the viewer → `rank: null` with the season.
 * - Either read failed → `null`.
 */
export async function fetchSeasonRank(
  userId: string,
): Promise<SeasonRankView | null> {
  try {
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, name, ends_at')
      .eq('is_active', true)
      .maybeSingle();
    if (seasonError) {
      console.error('fetchSeasonRank (season):', seasonError);
      return null;
    }
    const active = season as {
      id: string;
      name: string | null;
      ends_at: string | null;
    } | null;
    if (!active) return { rank: null, seasonName: null, endsAt: null };

    const { data: row, error } = await supabase
      .from('rankings')
      .select('rank')
      .eq('profile_id', userId)
      .eq('season_id', active.id)
      .maybeSingle();
    if (error) {
      console.error('fetchSeasonRank (rankings):', error);
      return null;
    }
    const rank = (row as { rank: number | null } | null)?.rank ?? null;
    return {
      rank,
      seasonName: active.name ?? null,
      endsAt: active.ends_at ?? null,
    };
  } catch (err) {
    console.error('fetchSeasonRank:', err);
    return null;
  }
}

/**
 * Completed battles between the viewer and any of the given rivals, newest
 * first. `[]` when there are no rivals to ask about; `null` when the read
 * failed. Only the viewer's own rows are readable, so the payload is the one
 * place an opponent's name, archetype and colour come from.
 */
export async function fetchRivalBattles(
  userId: string,
  rivalIds: readonly string[],
): Promise<RivalBattleLike[] | null> {
  const ids = rivalIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return [];
  const list = ids.join(',');
  try {
    const { data, error } = await supabase
      .from('battles')
      .select(RIVAL_BATTLE_COLUMNS)
      .eq('status', 'completed')
      .or(`player_one_id.eq.${userId},player_two_id.eq.${userId}`)
      .or(`player_one_id.in.(${list}),player_two_id.in.(${list})`)
      .order('created_at', { ascending: false })
      .limit(RIVAL_BATTLE_LIMIT);
    if (error) {
      console.error('fetchRivalBattles:', error);
      return null;
    }
    return (data as unknown as RivalBattleLike[] | null) ?? [];
  } catch (err) {
    console.error('fetchRivalBattles:', err);
    return null;
  }
}

/**
 * The equipped signature item's name. `signature_items` rows are not readable
 * except the caller's own, so this goes through the catalog function, which
 * includes the caller's custom items. `null` when unset, unknown or failed.
 */
/**
 * Names resolved this session, by item id. The catalogue comes from an Edge
 * Function, and the profile refetches on every focus; a name does not change
 * between focuses, so the second and later loads must not pay a cold start
 * for it. Failures are not cached, so a retry can still succeed.
 */
const itemNameCache = new Map<string, string>();

/** Tests share module state; the app never needs this. */
export function clearSignatureItemNameCache(): void {
  itemNameCache.clear();
}

export async function fetchSignatureItemName(
  itemId: string | null | undefined,
): Promise<string | null> {
  if (!itemId) return null;
  const cached = itemNameCache.get(itemId);
  if (cached) return cached;
  try {
    const items = await listSignatureItemsCatalog();
    const name = items.find((item) => item.id === itemId)?.name ?? null;
    if (name) itemNameCache.set(itemId, name);
    return name;
  } catch (err) {
    console.error('fetchSignatureItemName:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure assembly
// ---------------------------------------------------------------------------

export interface RivalView {
  summary: RivalSummary;
  identity: RivalIdentity;
  record: RivalRecord;
}

/** The battles in which `rivalId` was the other player. */
export function battlesWithRival(
  battles: readonly RivalBattleLike[],
  rivalId: string,
): RivalBattleLike[] {
  return battles.filter(
    (b) => b.player_one_id === rivalId || b.player_two_id === rivalId,
  );
}

/** Joins the rivals list with the viewer's battles against each of them. */
export function buildRivalViews(
  rivals: readonly RivalSummary[],
  battles: readonly RivalBattleLike[],
  myId: string,
): RivalView[] {
  return rivals.map((summary) => {
    const shared = battlesWithRival(battles, summary.rivalProfileId);
    return {
      summary,
      identity: rivalIdentityFromBattles(shared, summary.rivalProfileId),
      record: rivalRecord(shared, myId),
    };
  });
}
