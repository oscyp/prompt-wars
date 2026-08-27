// Restore Portrait Edge Function
// Points a character back at one of its earlier renders. Free, and the only
// non-destructive action in the portrait flow.
//
// Regeneration is paid and non-deterministic: a player spends a credit and may
// get something worse than what they had. The renders were already being kept
// (regenerate-portrait demotes rather than deletes, and maintains
// characters.portrait_history), but nothing could reach them, so the only
// remedy for a bad roll was to pay for another one. This closes that loop.
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

interface RestoreRequest {
  character_id: string;
  portrait_id: string;
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
  if (!body.character_id) return err('bad_request', 'character_id required', 400);
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
  const { data: portrait, error: portraitErr } = await supabase
    .from('character_portraits')
    .select('id, character_id, profile_id, kind, image_path, moderation_status')
    .eq('id', body.portrait_id)
    .maybeSingle();

  if (portraitErr) return err('server_error', portraitErr.message, 500);
  if (!portrait || portrait.character_id !== character.id) {
    return err('not_found', 'portrait not found for this character', 404);
  }
  if (portrait.profile_id !== userId) {
    return err('forbidden', 'not the owner of this portrait', 403);
  }
  if (portrait.moderation_status === 'rejected') {
    return err('conflict', 'that render was withdrawn by moderation', 409);
  }

  const kind = (portrait.kind as string) ?? 'fighter';
  const isAvatar = kind === 'avatar';

  // Already the live render for its kind -- nothing to do.
  const currentPointer = isAvatar
    ? character.avatar_portrait_id
    : character.portrait_id;
  if (currentPointer === portrait.id) {
    return ok({ portrait_id: portrait.id, unchanged: true });
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

  // Demote the current render of this kind only -- restoring a fighter must not
  // retire the avatar, the same distinction regenerate-portrait maintains.
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

  const patch = isAvatar
    ? { avatar_portrait_id: portrait.id }
    : { portrait_id: portrait.id };

  const { error: charUpdateErr } = await supabase
    .from('characters')
    .update(patch)
    .eq('id', character.id);
  if (charUpdateErr) return err('server_error', charUpdateErr.message, 500);

  // Logged like any other edit so the history is auditable, at zero cost.
  const { data: edit } = await supabase
    .from('character_edits')
    .insert({
      character_id: character.id,
      profile_id: userId,
      edit_kind: 'portrait_restore',
      before: { portrait_id: currentPointer },
      after: { portrait_id: portrait.id },
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
  });
});
