// Restore Portrait Edge Function
// Points a character back at one of its earlier renders. Free, and the only
// non-destructive action in the portrait flow.
//
// Regeneration is paid and non-deterministic: a player spends credits and may
// get something worse than what they had. The renders were already being kept
// (regenerate-portrait demotes rather than deletes, and maintains
// characters.portrait_history), but nothing could reach them, so the only
// remedy for a bad roll was to pay for another one. This closes that loop.
//
// A render is two images. Restoring a fighter brings its avatar back with it
// when the pair can be established (see _shared/portrait-pairing.ts); without
// that, the player got an old body under a new face and the two rows the
// render produced drifted apart for good. Restoring an avatar by id stays a
// single-image change: the avatar is the derived image, and asking for one
// explicitly is asking for exactly that one.
//
// No credit charge: undo is not a purchase. Charging to revert would re-create
// the downside risk this exists to remove.

import {
  corsHeaders,
  createServiceClient,
  getAuthUserId,
} from '../_shared/utils.ts';
import { err, ok } from '../_shared/character-creation.ts';
import { isTestUser } from '../_shared/test-user.ts';
import {
  type PairingAvatarCandidate,
  type PairingEditRow,
  pickPairedAvatar,
} from '../_shared/portrait-pairing.ts';

interface RestoreRequest {
  character_id: string;
  portrait_id: string;
}

// deno-lint-ignore no-explicit-any
type Db = any;

interface PortraitRow {
  id: string;
  character_id: string;
  profile_id: string;
  kind: string | null;
  image_path: string;
  moderation_status: string | null;
  appearance_version: number | null;
  created_at: string;
}

/**
 * The avatar that was rendered alongside `fighter`, if it can be established
 * and is still usable. Returns null rather than guessing: an unpaired restore
 * leaves the avatar alone, which is what the function always did.
 */
async function findPairedAvatar(
  supabase: Db,
  characterId: string,
  fighter: PortraitRow,
): Promise<string | null> {
  const { data: edits } = await supabase
    .from('character_edits')
    .select('after, created_at')
    .eq('character_id', characterId)
    .eq('after->>portrait_id', fighter.id)
    .not('after->>avatar_portrait_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  let candidates: PairingAvatarCandidate[] = [];
  if (
    fighter.appearance_version !== null &&
    fighter.appearance_version !== undefined
  ) {
    const { data } = await supabase
      .from('character_portraits')
      .select('id, kind, appearance_version, created_at, moderation_status')
      .eq('character_id', characterId)
      .eq('kind', 'avatar')
      .eq('appearance_version', fighter.appearance_version)
      .neq('moderation_status', 'rejected')
      .order('created_at')
      .limit(10);
    candidates = (data ?? []) as PairingAvatarCandidate[];
  }

  const editRows = (edits ?? []) as PairingEditRow[];
  const fromEdits = pickPairedAvatar(fighter, editRows, candidates);
  if (fromEdits && (await isUsableAvatar(supabase, characterId, fromEdits))) {
    return fromEdits;
  }
  // The audit row named an avatar that has since been withdrawn or removed;
  // fall through to the version match, which was filtered at query time.
  return pickPairedAvatar(fighter, [], candidates);
}

/** The audit trail can outlive the row it names; verify before promoting it. */
async function isUsableAvatar(
  supabase: Db,
  characterId: string,
  avatarId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('character_portraits')
    .select('id, kind, character_id, moderation_status')
    .eq('id', avatarId)
    .maybeSingle();
  return Boolean(
    data &&
    data.character_id === characterId &&
    data.kind === 'avatar' &&
    data.moderation_status !== 'rejected',
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  try {
    userId = await getAuthUserId(req);
  } catch {
    return err('unauthorized', 'authentication required', 401);
  }

  let body: RestoreRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }
  if (!body.character_id)
    return err('bad_request', 'character_id required', 400);
  if (!body.portrait_id) return err('bad_request', 'portrait_id required', 400);

  const supabase = createServiceClient();

  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select('id, profile_id, portrait_id, avatar_portrait_id')
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }

  // The portrait must belong to THIS character, not merely to this user --
  // otherwise a player could graft one character's render onto another.
  const { data: loaded, error: portraitErr } = await supabase
    .from('character_portraits')
    .select(
      'id, character_id, profile_id, kind, image_path, moderation_status, appearance_version, created_at',
    )
    .eq('id', body.portrait_id)
    .maybeSingle();

  if (portraitErr) return err('server_error', portraitErr.message, 500);
  const portrait = loaded as PortraitRow | null;
  if (!portrait || portrait.character_id !== character.id) {
    return err('not_found', 'portrait not found for this character', 404);
  }
  if (portrait.profile_id !== userId) {
    return err('forbidden', 'not the owner of this portrait', 403);
  }
  if (portrait.moderation_status === 'rejected') {
    return err('conflict', 'that render was withdrawn by moderation', 409);
  }

  const kind = portrait.kind ?? 'fighter';
  const isAvatar = kind === 'avatar';
  const currentAvatarId =
    (character.avatar_portrait_id as string | null) ?? null;
  const currentFighterId = (character.portrait_id as string | null) ?? null;

  // Already the live render for its kind -- nothing to do.
  const currentPointer = isAvatar ? currentAvatarId : currentFighterId;
  if (currentPointer === portrait.id) {
    return ok({
      portrait_id: portrait.id,
      kind,
      unchanged: true,
      avatar_portrait_id: currentAvatarId,
      avatar_restored: false,
    });
  }

  // Same rule as regenerate-portrait: a character's look is frozen once it is
  // committed to a battle, so opponents cannot be shown a moving target.
  const testUser = await isTestUser(supabase, userId);
  if (!testUser) {
    const { data: activeBattles } = await supabase
      .from('battles')
      .select('id')
      .or(
        `player_one_character_id.eq.${character.id},player_two_character_id.eq.${character.id}`,
      )
      .not(
        'status',
        'in',
        '(completed,expired,canceled,moderation_failed,generation_failed)',
      )
      .limit(1);
    if (activeBattles && activeBattles.length > 0) {
      return err('battle_locked', 'character is in an active battle', 409);
    }
  }

  // Which avatar, if any, moves with a fighter restore. Decided before any
  // write so a failed lookup cannot leave the pointers half-moved.
  const pairedAvatarId = isAvatar
    ? null
    : await findPairedAvatar(supabase, character.id, portrait);
  const avatarRestored =
    pairedAvatarId !== null && pairedAvatarId !== currentAvatarId;

  // Demote the current render of this kind only -- restoring a fighter must not
  // retire the avatar unless its pair is taking over, the same distinction
  // regenerate-portrait maintains.
  await supabase
    .from('character_portraits')
    .update({ is_current: false })
    .eq('character_id', character.id)
    .eq('kind', kind)
    .eq('is_current', true);

  const { error: promoteErr } = await supabase
    .from('character_portraits')
    .update({ is_current: true })
    .eq('id', portrait.id);
  if (promoteErr) return err('server_error', promoteErr.message, 500);

  if (avatarRestored) {
    await supabase
      .from('character_portraits')
      .update({ is_current: false })
      .eq('character_id', character.id)
      .eq('kind', 'avatar')
      .eq('is_current', true);
    const { error: avatarPromoteErr } = await supabase
      .from('character_portraits')
      .update({ is_current: true })
      .eq('id', pairedAvatarId);
    if (avatarPromoteErr)
      return err('server_error', avatarPromoteErr.message, 500);
  }

  // Both pointers in ONE update: a reader between two writes would see the
  // restored body under the retiring face, which is the mismatch this exists
  // to prevent.
  const nextFighterId = isAvatar ? currentFighterId : portrait.id;
  const nextAvatarId = isAvatar
    ? portrait.id
    : avatarRestored
      ? pairedAvatarId
      : currentAvatarId;
  const patch: Record<string, string | null> = isAvatar
    ? { avatar_portrait_id: portrait.id }
    : avatarRestored
      ? { portrait_id: portrait.id, avatar_portrait_id: pairedAvatarId }
      : { portrait_id: portrait.id };

  const { error: charUpdateErr } = await supabase
    .from('characters')
    .update(patch)
    .eq('id', character.id);
  if (charUpdateErr) return err('server_error', charUpdateErr.message, 500);

  // Logged like any other edit so the history is auditable, at zero cost.
  // `after` records the resulting state of BOTH pointers: portrait-pairing
  // reads `after.portrait_id` / `after.avatar_portrait_id` to reconstruct
  // which face went with which body, so an explicit avatar restore teaches it
  // the pair the player chose.
  const { data: edit } = await supabase
    .from('character_edits')
    .insert({
      character_id: character.id,
      profile_id: userId,
      edit_kind: 'portrait_restore',
      before: {
        portrait_id: currentFighterId,
        avatar_portrait_id: currentAvatarId,
      },
      after: {
        portrait_id: nextFighterId,
        avatar_portrait_id: nextAvatarId,
        kind,
        avatar_restored: avatarRestored,
      },
      credits_spent: 0,
      wallet_transaction_id: null,
    })
    .select('id')
    .single();

  return ok({
    portrait_id: portrait.id,
    kind,
    image_path: portrait.image_path,
    edit_id: edit?.id ?? null,
    /** The avatar pointer after this restore. */
    avatar_portrait_id: nextAvatarId,
    /** True only when a fighter restore also moved the avatar to its pair. */
    avatar_restored: avatarRestored,
  });
});
