/**
 * Thin Supabase reads behind the Stats screen's insight cards.
 *
 * Same contract as `utils/profileData.ts`: every fetcher resolves, never
 * rejects, and `null` means "the read failed" so the screen can say
 * "couldn't load" for one card instead of blanking the page or, worse,
 * printing "no rounds yet" over a network error.
 *
 * Both tables are readable under RLS for the caller's own side:
 * `battle_prompts` always shows a player their own rows, and `battle_rounds`
 * shows every round of a battle they took part in.
 */

import { supabase } from './supabase';
import type { MoveType } from './battles';

// ---------------------------------------------------------------------------
// Row types (client-readable columns only)
// ---------------------------------------------------------------------------

export interface MyPromptRow {
  battle_id: string;
  round_number: number;
  move_type: MoveType;
  custom_prompt_text: string | null;
}

export interface RoundScoreRow {
  battle_id: string;
  round_number: number;
  round_winner_id: string | null;
  is_draw: boolean | null;
  /** NUMERIC(8,4) in Postgres; coerce with Number() before arithmetic. */
  player_one_score: number | string | null;
  player_two_score: number | string | null;
  is_ko: boolean | null;
}

export const MY_PROMPT_COLUMNS = [
  'battle_id',
  'round_number',
  'move_type',
  'custom_prompt_text',
].join(', ');

export const ROUND_SCORE_COLUMNS = [
  'battle_id',
  'round_number',
  'round_winner_id',
  'is_draw',
  'player_one_score',
  'player_two_score',
  'is_ko',
].join(', ');

export const MY_PROMPT_LIMIT = 200;

/** PostgREST `in()` lists are URL-encoded; keep each request well under limits. */
export const ROUND_BATTLE_CHUNK = 100;

/** Only `.in()` values we built ourselves: ids must look like uuids. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The caller's own locked prompts, newest lock first. Drafts that were never
 * locked are not moves the player made, so they are excluded.
 */
export async function fetchMyPrompts(
  userId: string,
  limit: number = MY_PROMPT_LIMIT,
): Promise<MyPromptRow[] | null> {
  try {
    const { data, error } = await supabase
      .from('battle_prompts')
      .select(MY_PROMPT_COLUMNS)
      .eq('profile_id', userId)
      .eq('is_locked', true)
      .order('locked_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('fetchMyPrompts:', error);
      return null;
    }
    return (data as unknown as MyPromptRow[] | null) ?? [];
  } catch (err) {
    console.error('fetchMyPrompts:', err);
    return null;
  }
}

/**
 * Round results for the given battles, fetched in chunks of
 * `ROUND_BATTLE_CHUNK` ids. `[]` when there is nothing to ask for; `null`
 * when any chunk failed, so a partial answer is never mistaken for the whole.
 */
export async function fetchRoundsForBattles(
  battleIds: readonly string[],
): Promise<RoundScoreRow[] | null> {
  const ids = Array.from(new Set(battleIds.filter((id) => UUID_RE.test(id))));
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ROUND_BATTLE_CHUNK) {
    chunks.push(ids.slice(i, i + ROUND_BATTLE_CHUNK));
  }

  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        supabase
          .from('battle_rounds')
          .select(ROUND_SCORE_COLUMNS)
          .in('battle_id', chunk),
      ),
    );
    const rows: RoundScoreRow[] = [];
    for (const { data, error } of results) {
      if (error) {
        console.error('fetchRoundsForBattles:', error);
        return null;
      }
      rows.push(...((data as unknown as RoundScoreRow[] | null) ?? []));
    }
    return rows;
  } catch (err) {
    console.error('fetchRoundsForBattles:', err);
    return null;
  }
}
