// Render Look Edge Function
//
// One paid action, two images. The fighter portrait and the avatar are two
// framings of one character, so this renders both and charges once
// (`render_look`); `mode: 'random'` shuffles every trait first and charges
// `random_character` instead.
//
// It renders what is already SAVED. Art style and the custom prompt used to
// arrive here as arguments, priced differently depending on which of them had
// changed -- but describing a character is free now and saves through
// edit-character's `look` batch, so this function no longer decides anything
// about the description. It draws it.

import {
  corsHeaders,
  createServiceClient,
  generateIdempotencyKey,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import { err, getEditPrice, ok } from '../_shared/character-creation.ts';
import { isTestUser } from '../_shared/test-user.ts';
import {
  itemFragmentFor,
  renderOnePortrait,
  traitsFromCharacter,
} from '../_shared/render-portrait.ts';
import { randomLookTraits } from '../_shared/look-edit.ts';
import type { ArtStyle } from '../_shared/portrait-prompt-resolver.ts';

interface RenderLookRequest {
  character_id: string;
  /**
   * 'render' redraws the saved look. 'random' shuffles all five traits first
   * and costs more, because it is a whole new character rather than a redraw.
   */
  mode?: 'render' | 'random';
}

const PORTRAIT_HISTORY_LIMIT = 3;

interface PortraitHistoryEntry {
  portrait_id: string;
  created_at: string;
}

function buildPortraitHistory(
  existing: unknown,
  priorPortraitId: string | null,
): PortraitHistoryEntry[] {
  if (!priorPortraitId) return Array.isArray(existing) ? (existing as PortraitHistoryEntry[]) : [];
  const list = Array.isArray(existing) ? (existing as PortraitHistoryEntry[]) : [];
  const filtered = list.filter((e) => e?.portrait_id !== priorPortraitId);
  const next: PortraitHistoryEntry[] = [
    { portrait_id: priorPortraitId, created_at: new Date().toISOString() },
    ...filtered,
  ];
  return next.slice(0, PORTRAIT_HISTORY_LIMIT);
}

const CHARACTER_COLUMNS =
  'id, profile_id, archetype, signature_color, vibe, silhouette, era, expression, ' +
  'palette_key, signature_item_id, portrait_seed, portrait_prompt_raw, ' +
  'portrait_prompt_resolved, portrait_id, avatar_portrait_id, art_style, ' +
  'portrait_history, appearance_version, traits_version';

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

  let body: RenderLookRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }
  if (!body.character_id) return err('bad_request', 'character_id required', 400);

  const mode = body.mode === 'random' ? 'random' : 'render';
  const supabase = createServiceClient();

  // Cast rather than infer: CHARACTER_COLUMNS is assembled from concatenated
  // literals for readability, and supabase-js can only derive a row type from a
  // single literal select.
  // deno-lint-ignore no-explicit-any
  type CharacterRow = Record<string, any>;

  const { data: loaded, error: charErr } = await supabase
    .from('characters')
    .select(CHARACTER_COLUMNS)
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!loaded) return err('not_found', 'character not found', 404);
  let character = loaded as CharacterRow;
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }
  if (character.portrait_seed === null) {
    return err('conflict', 'character has no portrait seed; use generate-portrait', 409);
  }

  const priceKey = mode === 'random' ? 'random_character' : 'render_look';
  const price = await getEditPrice(supabase, priceKey);
  if (!price) return err('server_error', 'price config missing', 500);

  const headerKey = req.headers.get('Idempotency-Key')?.trim();
  const idempotencyKey = headerKey
    ? generateIdempotencyKey(['render', userId, character.id, headerKey])
    : null;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('character_edits')
      .select('id, after')
      .eq('profile_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) {
      return ok({ idempotent: true, edit_id: existing.id, after: existing.after });
    }
  }

  // A character's look is frozen once it is committed to a battle, so opponents
  // cannot be shown a moving target.
  const testUser = await isTestUser(supabase, userId);
  if (!testUser) {
    const { data: activeBattles } = await supabase
      .from('battles')
      .select('id, status')
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

  // Shuffle BEFORE charging and rendering: the traits write bumps
  // appearance_version, and both renders must be stamped with the value that
  // results, or a brand-new random character reads as out of date immediately.
  if (mode === 'random') {
    const { data: shuffled, error: shuffleErr } = await supabase
      .from('characters')
      .update({
        ...randomLookTraits(),
        traits_version: (character.traits_version ?? 0) + 1,
        // A random character is a fresh start, so any custom description the
        // player had written is cleared -- otherwise the prompt resolver keeps
        // using their words and the shuffled traits never reach the image.
        portrait_prompt_raw: null,
      })
      .eq('id', character.id)
      .select(CHARACTER_COLUMNS)
      .single();
    if (shuffleErr || !shuffled) {
      return err('server_error', shuffleErr?.message ?? 'trait shuffle failed', 500);
    }
    character = shuffled as CharacterRow;
  }

  const promptRaw = (character.portrait_prompt_raw as string | null) ?? '';
  const artStyle = (character.art_style as ArtStyle | null) ?? 'painterly';
  const seed = character.portrait_seed as number;
  const appearanceVersion = (character.appearance_version as number | null) ?? 0;

  if (promptRaw.trim().length > 0) {
    const modResult = await new TextModerationProvider().moderate(promptRaw);
    if (modResult.status === 'rejected') {
      return err('moderation_rejected', modResult.reason ?? 'prompt rejected', 422);
    }
  }

  const traits = traitsFromCharacter(character);
  const itemFragment = await itemFragmentFor(supabase, character.signature_item_id);

  let walletTxId: string | null = null;
  if (price.credits > 0) {
    const spendKey = idempotencyKey
      ? `spend_${idempotencyKey}`
      : generateIdempotencyKey(['spend', priceKey, character.id, crypto.randomUUID()]);
    const { data: txId, error: spendErr } = await supabase.rpc('spend_credits', {
      p_profile_id: userId,
      p_amount: price.credits,
      p_reason: priceKey,
      p_idempotency_key: spendKey,
      p_battle_id: null,
      p_video_job_id: null,
      p_metadata: { character_id: character.id, mode },
    });
    if (spendErr) {
      if (/Insufficient credits/i.test(spendErr.message ?? '')) {
        return err('insufficient_credits', spendErr.message, 402);
      }
      return err('server_error', spendErr.message, 500);
    }
    walletTxId = (txId as unknown as string) ?? null;
  }

  const refund = async (reason: string): Promise<void> => {
    if (!walletTxId || price.credits <= 0) return;
    await supabase.rpc('grant_credits', {
      p_profile_id: userId,
      p_amount: price.credits,
      p_reason: `${priceKey}_refund:${reason}`,
      p_idempotency_key: `refund_${walletTxId}`,
      p_battle_id: null,
      p_purchase_id: null,
      p_metadata: { character_id: character.id, original_tx: walletTxId },
    });
  };

  const renderArgs = {
    supabase,
    userId,
    character,
    promptRaw,
    artStyle,
    traits,
    itemFragment,
    seed,
    jobKind: 'regenerate' as const,
    idempotencyKey,
  };

  // The fighter is the deliverable. If it fails, nothing was bought.
  const fighter = await renderOnePortrait({ ...renderArgs, kind: 'fighter' });
  if (!fighter.ok) {
    await refund(fighter.code);
    return err(fighter.code, fighter.message, fighter.status);
  }

  await supabase
    .from('characters')
    .update({
      portrait_id: fighter.portraitId,
      portrait_prompt_resolved: fighter.resolvedPrompt,
      portrait_history: buildPortraitHistory(
        character.portrait_history,
        (character.portrait_id as string | null) ?? null,
      ),
    })
    .eq('id', character.id);

  await supabase
    .from('character_portraits')
    .update({ appearance_version: appearanceVersion })
    .eq('id', fighter.portraitId);

  // The avatar is derived from the same look and the same seed. If it fails we
  // keep the portrait the player just paid for, charge nothing extra, and say
  // so -- failing the whole purchase over the secondary image would take a good
  // render away for no reason, and refunding it would give away the render.
  const avatar = await renderOnePortrait({ ...renderArgs, kind: 'avatar' });
  if (avatar.ok) {
    await supabase
      .from('characters')
      .update({ avatar_portrait_id: avatar.portraitId })
      .eq('id', character.id);
    await supabase
      .from('character_portraits')
      .update({ appearance_version: appearanceVersion })
      .eq('id', avatar.portraitId);
  } else {
    console.error('avatar leg failed; portrait kept and charge stands', {
      character_id: character.id,
      code: avatar.code,
      message: avatar.message,
    });
  }

  const { data: edit } = await supabase
    .from('character_edits')
    .insert({
      character_id: character.id,
      profile_id: userId,
      edit_kind: mode === 'random' ? 'traits' : 'regenerate_portrait',
      before: { portrait_id: character.portrait_id },
      after: {
        portrait_id: fighter.portraitId,
        avatar_portrait_id: avatar.ok ? avatar.portraitId : null,
        mode,
      },
      credits_spent: price.credits,
      wallet_transaction_id: walletTxId,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  return ok({
    portrait_id: fighter.portraitId,
    avatar_portrait_id: avatar.ok ? avatar.portraitId : null,
    /** True when the portrait landed but the avatar did not. Retry it free. */
    avatar_pending: !avatar.ok,
    job_id: fighter.jobId,
    edit_id: edit?.id ?? null,
    credits_spent: price.credits,
    image_path: fighter.imagePath,
  });
});
