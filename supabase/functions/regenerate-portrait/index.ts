// Render Look Edge Function
//
// One paid action, two images. The fighter portrait and the avatar are two
// framings of one character, so this renders both and charges once
// (`render_look`); `mode: 'random'` shuffles every trait first and charges
// `random_character` instead.
//
// `mode: 'avatar_only'` is the free repair for the one way a paid render can
// half-succeed: the fighter landed, the avatar leg failed, the charge stood.
// The player already bought that avatar, so drawing it again costs nothing --
// but only while the fighter is the current look and the avatar is missing or
// older than it. Anything else is a paid render asking to be free, and the
// guard in _shared/render-look.ts says no.
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
import {
  insufficientCreditsResponse,
  isInsufficientCreditsError,
} from '../_shared/credits.ts';
import { isTestUser } from '../_shared/test-user.ts';
import {
  itemFragmentFor,
  renderOnePortrait,
  traitsFromCharacter,
} from '../_shared/render-portrait.ts';
import { randomLookTraits } from '../_shared/look-edit.ts';
import {
  avatarRetryEligibility,
  type RenderLookResponse,
  type ReplayEditRow,
  type ReplayPortraitRow,
  replayPortraitIds,
  replayResponseFromEdit,
  resolveRenderMode,
} from '../_shared/render-look.ts';
import type { ArtStyle } from '../_shared/portrait-prompt-resolver.ts';

interface RenderLookRequest {
  character_id: string;
  /**
   * 'render' redraws the saved look. 'random' shuffles all five traits first
   * and costs more, because it is a whole new character rather than a redraw.
   * 'avatar_only' redraws just the avatar, free, when a paid render left it
   * missing or behind the fighter.
   */
  mode?: 'render' | 'random' | 'avatar_only';
  /** Alternative to the Idempotency-Key header; the header wins when both are sent. */
  idempotency_key?: string;
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
  if (!priorPortraitId)
    return Array.isArray(existing) ? (existing as PortraitHistoryEntry[]) : [];
  const list = Array.isArray(existing)
    ? (existing as PortraitHistoryEntry[])
    : [];
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

// Cast rather than infer: CHARACTER_COLUMNS is assembled from concatenated
// literals for readability, and supabase-js can only derive a row type from a
// single literal select.
// deno-lint-ignore no-explicit-any
type CharacterRow = Record<string, any>;
// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Answers a replayed request with the response the first one produced. The
 * portrait rows are re-read for their paths and job ids; the audit row only
 * stores ids.
 */
async function replayFromEdit(
  supabase: Db,
  edit: ReplayEditRow,
): Promise<Response> {
  const ids = replayPortraitIds(edit);
  const portraitsById: Record<string, ReplayPortraitRow> = {};
  if (ids.length > 0) {
    const { data: rows } = await supabase
      .from('character_portraits')
      .select('id, image_path, generation_job_id')
      .in('id', ids);
    for (const row of (rows ?? []) as ReplayPortraitRow[])
      portraitsById[row.id] = row;
  }
  return ok(replayResponseFromEdit(edit, portraitsById));
}

/**
 * The key a retried attempt uses for its spend and its portrait_jobs rows.
 *
 * `character_edits.idempotency_key` carries the bare key so a replay of a
 * SUCCESSFUL request is recognised. But a FAILED attempt also leaves traces
 * under that key: a portrait_jobs row (UNIQUE on profile_id + idempotency_key,
 * so the retry's job insert would collide and the render would run untracked)
 * and, on the paid path, a wallet transaction that `spend_credits` would hand
 * back on the retry without charging -- after its refund had already been paid
 * out. Scoping the retry to an attempt number keeps the audit-row replay while
 * making every attempt pay for, and record, itself.
 */
async function attemptScopedKey(
  supabase: Db,
  userId: string,
  baseKey: string,
): Promise<string> {
  const { count } = await supabase
    .from('portrait_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .like('idempotency_key', `${baseKey}%`);
  const attempts = (count as number | null) ?? 0;
  return attempts > 0 ? `${baseKey}_r${attempts}` : baseKey;
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

  let body: RenderLookRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }
  if (!body.character_id)
    return err('bad_request', 'character_id required', 400);

  const mode = resolveRenderMode(body.mode);
  const supabase = createServiceClient();

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
    return err(
      'conflict',
      'character has no portrait seed; use generate-portrait',
      409,
    );
  }

  // The paid modes are keyed by the client (header or body, header wins) so a
  // lost response can be retried without paying twice. The free retry derives
  // its own key below: it is keyed by WHAT it repairs, not by who asked.
  const headerKey =
    req.headers.get('Idempotency-Key')?.trim() ?? body.idempotency_key?.trim();
  const idempotencyKey =
    mode !== 'avatar_only' && headerKey
      ? generateIdempotencyKey(['render', userId, character.id, headerKey])
      : null;

  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('character_edits')
      .select('id, edit_kind, after, credits_spent')
      .eq('profile_id', userId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing)
      return await replayFromEdit(supabase, existing as ReplayEditRow);
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

  if (mode === 'avatar_only') {
    return await renderAvatarOnly(supabase, userId, character);
  }

  const priceKey = mode === 'random' ? 'random_character' : 'render_look';
  const price = await getEditPrice(supabase, priceKey);
  if (!price) return err('server_error', 'price config missing', 500);

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
      return err(
        'server_error',
        shuffleErr?.message ?? 'trait shuffle failed',
        500,
      );
    }
    character = shuffled as CharacterRow;
  }

  const promptRaw = (character.portrait_prompt_raw as string | null) ?? '';
  const artStyle = (character.art_style as ArtStyle | null) ?? 'painterly';
  const seed = character.portrait_seed as number;
  const appearanceVersion =
    (character.appearance_version as number | null) ?? 0;

  if (promptRaw.trim().length > 0) {
    const modResult = await new TextModerationProvider().moderate(promptRaw);
    if (modResult.status === 'rejected') {
      return err(
        'moderation_rejected',
        modResult.reason ?? 'prompt rejected',
        422,
      );
    }
  }

  const traits = traitsFromCharacter(character);
  const itemFragment = await itemFragmentFor(
    supabase,
    character.signature_item_id,
  );

  const attemptKey = idempotencyKey
    ? await attemptScopedKey(supabase, userId, idempotencyKey)
    : null;

  let walletTxId: string | null = null;
  if (price.credits > 0) {
    const spendKey = attemptKey
      ? `spend_${attemptKey}`
      : generateIdempotencyKey([
          'spend',
          priceKey,
          character.id,
          crypto.randomUUID(),
        ]);
    const { data: txId, error: spendErr } = await supabase.rpc(
      'spend_credits',
      {
        p_profile_id: userId,
        p_amount: price.credits,
        p_reason: priceKey,
        p_idempotency_key: spendKey,
        p_battle_id: null,
        p_video_job_id: null,
        p_metadata: { character_id: character.id, mode },
      },
    );
    if (spendErr) {
      if (isInsufficientCreditsError(spendErr.message)) {
        return insufficientCreditsResponse(spendErr.message, price.credits);
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
    idempotencyKey: attemptKey,
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
  // `mode: 'avatar_only'` is the free repair for exactly this outcome.
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
      before: {
        portrait_id: character.portrait_id,
        avatar_portrait_id: character.avatar_portrait_id ?? null,
      },
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

  const response: RenderLookResponse = {
    portrait_id: fighter.portraitId,
    image_path: fighter.imagePath,
    avatar_portrait_id: avatar.ok ? avatar.portraitId : null,
    avatar_image_path: avatar.ok ? avatar.imagePath : null,
    avatar_pending: !avatar.ok,
    job_id: fighter.jobId,
    avatar_job_id: null,
    edit_id: edit?.id ?? null,
    credits_spent: price.credits,
    mode,
  };
  return ok(response);
});

/**
 * The free avatar retry. Runs after ownership, seed and battle-lock checks;
 * never shuffles, never charges.
 *
 * Order matters: eligibility is decided BEFORE the replay lookup. A successful
 * retry stamps the avatar with the fighter's version, so a second identical
 * request is a genuine `avatar_current` refusal, not a replay -- the
 * deterministic key would otherwise answer every later tap with the first
 * result and the client could never learn that there is nothing left to fix.
 * The replay branch therefore only answers the narrow case where the audit row
 * exists but the pointer or stamp did not land.
 */
async function renderAvatarOnly(
  supabase: Db,
  userId: string,
  character: CharacterRow,
): Promise<Response> {
  const pointerIds = [
    character.portrait_id,
    character.avatar_portrait_id,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  interface PointerRow {
    id: string;
    kind: string | null;
    image_path: string | null;
    appearance_version: number | null;
    moderation_status: string | null;
  }
  const portraitsById: Record<string, PointerRow> = {};
  if (pointerIds.length > 0) {
    const { data: rows, error: rowsErr } = await supabase
      .from('character_portraits')
      .select('id, kind, image_path, appearance_version, moderation_status')
      .in('id', pointerIds)
      .eq('character_id', character.id);
    if (rowsErr) return err('server_error', rowsErr.message, 500);
    for (const row of (rows ?? []) as PointerRow[]) portraitsById[row.id] = row;
  }
  const fighter = character.portrait_id
    ? (portraitsById[character.portrait_id] ?? null)
    : null;
  const avatar = character.avatar_portrait_id
    ? (portraitsById[character.avatar_portrait_id] ?? null)
    : null;

  const eligibility = avatarRetryEligibility({
    character: {
      appearance_version: (character.appearance_version as number | null) ?? 0,
    },
    fighter:
      fighter && fighter.moderation_status !== 'rejected' ? fighter : null,
    avatar,
  });
  if (!eligibility.eligible) {
    return err(eligibility.code, eligibility.message, eligibility.status);
  }
  // Narrowed by the eligibility result; the guard above returned on null.
  const currentFighter = fighter as PointerRow;

  const idempotencyKey = generateIdempotencyKey([
    'render_avatar_only',
    userId,
    currentFighter.id,
  ]);

  const { data: existing } = await supabase
    .from('character_edits')
    .select('id, edit_kind, after, credits_spent')
    .eq('profile_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (existing)
    return await replayFromEdit(supabase, existing as ReplayEditRow);

  const promptRaw = (character.portrait_prompt_raw as string | null) ?? '';
  const artStyle = (character.art_style as ArtStyle | null) ?? 'painterly';
  const seed = character.portrait_seed as number;

  // The description was moderated when the fighter was rendered from it and
  // has not changed since (same appearance_version), but the check is cheap
  // and the provider call is not.
  if (promptRaw.trim().length > 0) {
    const modResult = await new TextModerationProvider().moderate(promptRaw);
    if (modResult.status === 'rejected') {
      return err(
        'moderation_rejected',
        modResult.reason ?? 'prompt rejected',
        422,
      );
    }
  }

  const traits = traitsFromCharacter(character);
  const itemFragment = await itemFragmentFor(
    supabase,
    character.signature_item_id,
  );
  const attemptKey = await attemptScopedKey(supabase, userId, idempotencyKey);

  const rendered = await renderOnePortrait({
    supabase,
    userId,
    character,
    kind: 'avatar',
    promptRaw,
    artStyle,
    traits,
    itemFragment,
    seed,
    jobKind: 'regenerate',
    idempotencyKey: attemptKey,
  });
  if (!rendered.ok)
    return err(rendered.code, rendered.message, rendered.status);

  const { error: patchErr } = await supabase
    .from('characters')
    .update({ avatar_portrait_id: rendered.portraitId })
    .eq('id', character.id);
  if (patchErr) return err('server_error', patchErr.message, 500);

  // Stamped with the FIGHTER's version, not the character's: eligibility has
  // proven they are equal, and the point of the stamp is "this avatar belongs
  // to that fighter".
  await supabase
    .from('character_portraits')
    .update({ appearance_version: eligibility.appearanceVersion })
    .eq('id', rendered.portraitId);

  const { data: edit } = await supabase
    .from('character_edits')
    .insert({
      character_id: character.id,
      profile_id: userId,
      edit_kind: 'regenerate_avatar',
      before: {
        avatar_portrait_id:
          (character.avatar_portrait_id as string | null) ?? null,
      },
      after: {
        portrait_id: currentFighter.id,
        avatar_portrait_id: rendered.portraitId,
        mode: 'avatar_only',
      },
      credits_spent: 0,
      wallet_transaction_id: null,
      idempotency_key: idempotencyKey,
    })
    .select('id')
    .single();

  const response: RenderLookResponse = {
    portrait_id: currentFighter.id,
    image_path: currentFighter.image_path,
    avatar_portrait_id: rendered.portraitId,
    avatar_image_path: rendered.imagePath,
    avatar_pending: false,
    job_id: rendered.jobId,
    avatar_job_id: null,
    edit_id: edit?.id ?? null,
    credits_spent: 0,
    mode: 'avatar_only',
  };
  return ok(response);
}
