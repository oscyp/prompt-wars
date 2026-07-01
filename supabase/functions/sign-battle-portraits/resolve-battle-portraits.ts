// Pure resolver for `sign-battle-portraits` (service-role, READ-ONLY).
//
// Given the caller's user id and a battle id, verifies the caller is a battle
// participant, then mints short-lived signed URLs to BOTH sides' CURRENT
// character portraits so the pre-battle face-off can display real generated
// portraits across participants. Portraits live in the private
// `character-portraits` bucket and are otherwise unreadable cross-participant,
// so signing is done with the service role AFTER the participant gate passes.
//
// Portrait loading + signing is REUSED from `_shared/compose-reveal-payload.ts`
// (`resolveCurrentPortrait` + `signPortraitPath`) — the same single source of
// truth the Tier 0 reveal uses — with a shorter face-off TTL.
//
// BOUNDARY (do not relax): authorization is gated on the caller being
// `player_one_id` OR `player_two_id`. Never throws on missing portraits — a
// side that is a bot / has no character / fails signing resolves to a null
// `portrait_url`, and one side failing never fails the other.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  resolveCurrentPortrait,
  signPortraitPath,
} from '../_shared/compose-reveal-payload.ts';

/** Signed-URL lifetime for face-off portraits (~1 hour). */
export const FACE_OFF_SIGNED_URL_TTL_SECONDS = 3600;

export interface BattleSidePortrait {
  /** Signed URL to this side's CURRENT portrait; null for bots / missing. */
  portrait_url: string | null;
  /** Archetype from this side's `characters` row; null when absent. */
  archetype: string | null;
}

export interface SignBattlePortraitsResponse {
  player_one: BattleSidePortrait;
  player_two: BattleSidePortrait;
}

export type ResolveBattlePortraitsResult =
  | { kind: 'ok'; payload: SignBattlePortraitsResponse }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

interface CharacterLite {
  id?: string | null;
  archetype?: string | null;
}

/**
 * Resolve one side's portrait URL + archetype.
 *
 * Bots and characters without a current portrait resolve to a null
 * `portrait_url` (the archetype is still surfaced from the `characters` row
 * when present). Signing failures are swallowed so one side never fails the
 * other.
 */
async function resolveSide(
  supabase: SupabaseClient,
  opts: { isBot: boolean; character: CharacterLite | null },
): Promise<BattleSidePortrait> {
  const archetype = opts.character?.archetype ?? null;
  const characterId = opts.character?.id ?? null;

  if (opts.isBot || !characterId) {
    return { portrait_url: null, archetype };
  }

  try {
    const portrait = await resolveCurrentPortrait(supabase, characterId);
    if (!portrait) return { portrait_url: null, archetype };

    const portraitUrl = await signPortraitPath(
      supabase,
      portrait.image_path,
      FACE_OFF_SIGNED_URL_TTL_SECONDS,
    );
    return { portrait_url: portraitUrl, archetype };
  } catch (error) {
    console.error(
      'sign-battle-portraits: side portrait resolution failed (non-blocking):',
      error,
    );
    return { portrait_url: null, archetype };
  }
}

/**
 * Verify participation and resolve signed portraits for both battle sides.
 *
 * Returns `forbidden` when the caller is neither participant, `not_found` when
 * the battle does not exist, else `ok` with both sides resolved. Throws only on
 * an unexpected battle-load database error (surfaced by the caller as 500).
 */
export async function resolveBattlePortraits(
  supabase: SupabaseClient,
  args: { battleId: string; callerUserId: string },
): Promise<ResolveBattlePortraitsResult> {
  const { data: battleRow, error } = await supabase
    .from('battles')
    .select(
      `
      id, player_one_id, player_two_id, is_player_two_bot,
      player_one_character_id, player_two_character_id,
      player_one_character:characters!battles_player_one_character_id_fkey(id, archetype),
      player_two_character:characters!battles_player_two_character_id_fkey(id, archetype)
    `,
    )
    .eq('id', args.battleId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `sign-battle-portraits: battle load failed (${error.message})`,
    );
  }
  if (!battleRow) return { kind: 'not_found' };

  // supabase-js types to-one embeds as arrays; each is a single object at
  // runtime. Read joined character fields directly via any.
  // deno-lint-ignore no-explicit-any
  const battle = battleRow as any;

  const isParticipant =
    battle.player_one_id === args.callerUserId ||
    battle.player_two_id === args.callerUserId;
  if (!isParticipant) return { kind: 'forbidden' };

  const isBot = !!battle.is_player_two_bot;

  const [playerOne, playerTwo] = await Promise.all([
    resolveSide(supabase, {
      isBot: false,
      character: (battle.player_one_character as CharacterLite | null) ?? null,
    }),
    resolveSide(supabase, {
      isBot,
      character: (battle.player_two_character as CharacterLite | null) ?? null,
    }),
  ]);

  return {
    kind: 'ok',
    payload: { player_one: playerOne, player_two: playerTwo },
  };
}
