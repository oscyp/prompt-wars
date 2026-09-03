// Generate Portrait Edge Function
// Portrait for a character still in the creation flow. No credit charge, and
// an unfinalized draft may re-roll through here as many times as it likes --
// picking a look you are happy with is part of creating the character, not a
// paid edit. The free path closes the moment finalize-character-creation gives
// the character a real battle_cry; after that, re-rolls cost credits and must
// go through regenerate-portrait.
// - Requires characters.portrait_seed IS NULL
// - Generates a random 32-bit seed and atomically sets it
// - Runs text moderation on portrait_prompt_raw
// - Inserts portrait_jobs(status=queued)
// - Calls image provider, uploads to character-portraits bucket
// - Inserts character_portraits(is_current=TRUE) and updates characters.portrait_id

import {
  corsHeaders,
  createServiceClient,
  generateIdempotencyKey,
  getAuthUserId,
} from '../_shared/utils.ts';
import { TextModerationProvider } from '../_shared/moderation.ts';
import {
  err,
  getEditPrice,
  isDraftCharacter,
  ok,
  randomPortraitSeed,
} from '../_shared/character-creation.ts';
import {
  insufficientCreditsResponse,
  isInsufficientCreditsError,
} from '../_shared/credits.ts';
import { renderOnePortrait } from '../_shared/render-portrait.ts';
import {
  generateCharacterPortrait,
  ImageProviderError,
  SafetyRefusedError,
} from '../_shared/image-provider.ts';
import type {
  Archetype,
  ArtStyle,
  PortraitTraits,
} from '../_shared/portrait-prompt-resolver.ts';
import { ART_STYLE_KEYS } from '../_shared/portrait-prompt-resolver.ts';

interface GeneratePortraitRequest {
  character_id: string;
  portrait_prompt_raw?: string;
  art_style?: ArtStyle;
  /**
   * Guided-path traits from the creation screen. They live only in the client's
   * draft until finalize-character-creation writes them, so during creation the
   * request body is the only place they exist -- without them every re-roll
   * renders from archetype alone and the results barely differ.
   */
  traits?: PortraitTraits;
}

const TRAIT_KEYS = [
  'vibe',
  'silhouette',
  'palette',
  'era',
  'expression',
] as const;
const MAX_TRAIT_LEN = 40;

/** Drop undefined entries so a null row column does not mask a body value. */
function stripUndefined(traits: PortraitTraits): PortraitTraits {
  return Object.fromEntries(
    Object.entries(traits).filter(([, v]) => v !== undefined),
  ) as PortraitTraits;
}

/** Keep only known trait keys with short string values; ignore anything else. */
function sanitizeTraits(input: unknown): PortraitTraits {
  if (!input || typeof input !== 'object') return {};
  const src = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of TRAIT_KEYS) {
    const value = src[key];
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_TRAIT_LEN
    ) {
      out[key] = value;
    }
  }
  return out as PortraitTraits;
}

/** Free portrait renders while a character is still a draft. */
const DRAFT_FREE_RENDERS = 3;

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

  let body: GeneratePortraitRequest;
  try {
    body = await req.json();
  } catch {
    return err('bad_request', 'invalid JSON body', 400);
  }

  if (!body.character_id) {
    return err('bad_request', 'character_id required', 400);
  }
  if (body.portrait_prompt_raw && body.portrait_prompt_raw.length > 200) {
    return err('bad_request', 'portrait_prompt_raw must be <= 200 chars', 400);
  }
  if (body.art_style && !ART_STYLE_KEYS.includes(body.art_style)) {
    return err('bad_request', 'invalid art_style', 400);
  }

  const supabase = createServiceClient();

  // Load character; verify ownership and that seed is null.
  const { data: character, error: charErr } = await supabase
    .from('characters')
    .select(
      'id, profile_id, draft_portrait_renders, archetype, signature_color, vibe, silhouette, era, expression, palette_key, signature_item_id, portrait_seed, portrait_prompt_raw, art_style, finalized_at, appearance_version',
    )
    .eq('id', body.character_id)
    .maybeSingle();

  if (charErr) return err('server_error', charErr.message, 500);
  if (!character) return err('not_found', 'character not found', 404);
  if (character.profile_id !== userId) {
    return err('forbidden', 'not the owner of this character', 403);
  }
  // Drafts re-roll freely; finalized characters are sent to the paid flow.
  const isDraft = isDraftCharacter(character.finalized_at as string | null);
  const priorSeed = (character.portrait_seed as number | null) ?? null;
  if (priorSeed !== null && !isDraft) {
    return err(
      'conflict',
      'portrait already initialized; use regenerate-portrait',
      409,
    );
  }

  // Three free re-rolls, then the same price as any other render.
  //
  // Uncapped free re-rolls made creation an unbounded 2-image path, but capping
  // it at one would be worse than the cost: the render is non-deterministic, so
  // a player's first impression of the game would be a character they may
  // dislike and cannot change. Three matches PORTRAIT_HISTORY_LIMIT, so they
  // generate exactly the set the app can remember and restore between.
  const rendersUsed = (character.draft_portrait_renders as number | null) ?? 0;
  const freeRender = !isDraft || rendersUsed < DRAFT_FREE_RENDERS;

  let walletTxId: string | null = null;
  let creditsSpent = 0;
  if (!freeRender) {
    const price = await getEditPrice(supabase, 'render_look');
    if (!price) return err('server_error', 'price config missing', 500);
    if (price.credits > 0) {
      const { data: txId, error: spendErr } = await supabase.rpc(
        'spend_credits',
        {
          p_profile_id: userId,
          p_amount: price.credits,
          p_reason: 'draft_render',
          p_idempotency_key: generateIdempotencyKey([
            'draft_render',
            character.id,
            String(rendersUsed),
          ]),
          p_battle_id: null,
          p_video_job_id: null,
          p_metadata: { character_id: character.id, renders_used: rendersUsed },
        },
      );
      if (spendErr) {
        if (isInsufficientCreditsError(spendErr.message)) {
          return insufficientCreditsResponse(spendErr.message, price.credits, {
            free_renders_used: rendersUsed,
            free_renders_total: DRAFT_FREE_RENDERS,
          });
        }
        return err('server_error', spendErr.message, 500);
      }
      walletTxId = (txId as unknown as string) ?? null;
      creditsSpent = price.credits;
    }
  }

  const refundDraftRender = async (reason: string): Promise<void> => {
    if (!walletTxId || creditsSpent <= 0) return;
    await supabase.rpc('grant_credits', {
      p_profile_id: userId,
      p_amount: creditsSpent,
      p_reason: `draft_render_refund:${reason}`,
      p_idempotency_key: `refund_${walletTxId}`,
      p_battle_id: null,
      p_purchase_id: null,
      p_metadata: { character_id: character.id },
    });
  };

  const promptRaw =
    body.portrait_prompt_raw ?? character.portrait_prompt_raw ?? '';
  const artStyle: ArtStyle =
    (body.art_style as ArtStyle | undefined) ??
    (character as { art_style?: ArtStyle }).art_style ??
    'painterly';

  // Moderate raw prompt (skip when empty).
  if (promptRaw.trim().length > 0) {
    const moderator = new TextModerationProvider();
    const modResult = await moderator.moderate(promptRaw);
    if (modResult.status === 'rejected') {
      return err(
        'moderation_rejected',
        modResult.reason ?? 'prompt rejected',
        422,
      );
    }
  }

  // Atomically claim a seed. A fresh character claims only while the seed is
  // still null; a draft re-roll compare-and-swaps against the seed we just
  // read, so two concurrent re-rolls cannot interleave and leave the row
  // pointing at one attempt's seed and the other's portrait.
  const seed = randomPortraitSeed();
  const claim = supabase
    .from('characters')
    .update({
      portrait_seed: seed,
      portrait_prompt_raw: promptRaw || null,
      art_style: artStyle,
    })
    .eq('id', character.id);
  const { data: claimed, error: claimErr } = await (
    priorSeed === null
      ? claim.is('portrait_seed', null)
      : claim.eq('portrait_seed', priorSeed)
  )
    .select('id, appearance_version')
    .maybeSingle();

  if (claimErr) return err('server_error', claimErr.message, 500);
  if (!claimed) {
    return err('conflict', 'portrait_seed already set', 409);
  }

  // The claim above writes portrait_prompt_raw and art_style, both of which
  // characters_guard_and_touch counts as appearance changes, so the version
  // loaded before it is already behind whenever the prompt or style moved.
  // Stamping the renders with the pre-claim value marked every first render
  // stale on arrival and made the free avatar retry refuse with fighter_stale.
  // The value the claim returns is the one this render actually depicts.
  const stampVersion =
    (claimed as { appearance_version?: number | null }).appearance_version ??
    character.appearance_version ??
    0;

  // Roll back our claim on a NON-safety failure so the free path can be retried
  // instead of 409ing to the paid regenerate flow. Restores the PREVIOUS seed
  // and prompt rather than nulling them: a draft re-roll already has a good
  // portrait on the row, and nulling the seed would strand it. Guarded on the
  // seed WE claimed, so a concurrent success is never clobbered. Safety refusals
  // keep the seed: they are deterministic (retrying identical inputs refuses
  // again), mirroring the video pipeline's isRetryableFailedJob which excludes
  // moderation rejections.
  const releaseClaimedSeed = async () => {
    const { error: releaseErr } = await supabase
      .from('characters')
      .update({
        portrait_seed: priorSeed,
        portrait_prompt_raw: character.portrait_prompt_raw,
        art_style:
          (character as { art_style?: ArtStyle }).art_style ?? 'painterly',
      })
      .eq('id', character.id)
      .eq('portrait_seed', seed);
    if (releaseErr) {
      console.error(
        'Failed to release portrait_seed after failure:',
        releaseErr,
      );
    }
  };

  // Look up signature item fragment if any.
  let itemFragment: string | undefined;
  if (character.signature_item_id) {
    const { data: item } = await supabase
      .from('signature_items')
      .select('prompt_fragment')
      .eq('id', character.signature_item_id)
      .maybeSingle();
    itemFragment = item?.prompt_fragment ?? undefined;
  }

  // Row values win once they exist; the request body fills the gap while the
  // character is still a draft. Not persisted here -- finalize-character-creation
  // remains the single writer of a character's traits.
  const rowTraits: PortraitTraits = {
    vibe: character.vibe ?? undefined,
    silhouette: character.silhouette ?? undefined,
    palette: character.palette_key ?? undefined,
    era: character.era ?? undefined,
    expression: character.expression ?? undefined,
  };
  const traits: PortraitTraits = {
    ...sanitizeTraits(body.traits),
    ...stripUndefined(rowTraits),
  };

  // Create job row in queued state.
  const { data: job, error: jobErr } = await supabase
    .from('portrait_jobs')
    .insert({
      character_id: character.id,
      profile_id: userId,
      kind: 'initial',
      status: 'queued',
      seed,
      prompt_payload: {
        raw: promptRaw,
        traits,
        archetype: character.archetype,
        signature_color: character.signature_color,
        signature_item_fragment: itemFragment ?? null,
        art_style: artStyle,
      },
    })
    .select('id')
    .single();

  if (jobErr || !job) {
    await refundDraftRender('job_insert_failed');
    return err('server_error', jobErr?.message ?? 'job insert failed', 500);
  }

  await supabase
    .from('portrait_jobs')
    .update({
      status: 'running',
      attempt: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  // Call provider.
  let result;
  try {
    result = await generateCharacterPortrait({
      prompt_raw: promptRaw || undefined,
      traits,
      archetype: character.archetype as Archetype,
      signature_color: character.signature_color,
      signature_item_fragment: itemFragment,
      seed,
      art_style: artStyle,
    });
  } catch (e) {
    const code =
      e instanceof SafetyRefusedError
        ? 'moderation_rejected'
        : e instanceof ImageProviderError
          ? e.code
          : 'provider_error';
    await supabase
      .from('portrait_jobs')
      .update({
        status:
          code === 'moderation_rejected' ? 'moderation_rejected' : 'failed',
        error_code: code,
        error_message: e instanceof Error ? e.message : String(e),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    if (code !== 'moderation_rejected') {
      await releaseClaimedSeed();
    }
    await refundDraftRender(code);
    return err(code, e instanceof Error ? e.message : 'provider failure', 502);
  }

  // Upload bytes.
  const portraitId = crypto.randomUUID();
  const ext =
    result.content_type === 'image/png'
      ? 'png'
      : result.content_type === 'image/jpeg'
        ? 'jpg'
        : 'webp';
  const storagePath = `${userId}/${character.id}/${portraitId}.${ext}`;

  const uploadRes = await supabase.storage
    .from('character-portraits')
    .upload(storagePath, result.image_bytes, {
      contentType: result.content_type,
      upsert: false,
    });

  if (uploadRes.error) {
    await supabase
      .from('portrait_jobs')
      .update({
        status: 'failed',
        error_code: 'storage_upload_failed',
        error_message: uploadRes.error.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    await releaseClaimedSeed();
    await refundDraftRender('storage_upload_failed');
    return err('storage_error', uploadRes.error.message, 500);
  }

  // Demote the prior current fighter portrait. Draft re-rolls come back through
  // here repeatedly, and without this the character accumulates several rows
  // all claiming is_current.
  await supabase
    .from('character_portraits')
    .update({ is_current: false })
    .eq('character_id', character.id)
    .eq('kind', 'fighter')
    .eq('is_current', true);

  // Insert character_portraits row.
  const { data: portrait, error: portraitErr } = await supabase
    .from('character_portraits')
    .insert({
      id: portraitId,
      character_id: character.id,
      profile_id: userId,
      image_path: storagePath,
      seed,
      provider: result.provider,
      provider_model: result.provider_model,
      prompt_snapshot: {
        raw: promptRaw,
        resolved: result.resolved_prompt,
        traits,
        archetype: character.archetype,
        signature_color: character.signature_color,
        signature_item_id: character.signature_item_id,
        // Lets the client say WHAT changed since this render, not just that
        // something did; every other prompt input was already here.
        art_style: artStyle,
      },
      generation_job_id: job.id,
      is_current: true,
      moderation_status: 'approved',
      // Stamps which version of the character's look this render depicts: the
      // version after the seed claim wrote the prompt and style. The only
      // character columns written below are portrait_id, avatar_portrait_id and
      // portrait_prompt_resolved, none of which the prompt reads.
      appearance_version: stampVersion,
    })
    .select('id')
    .single();

  if (portraitErr || !portrait) {
    await supabase
      .from('portrait_jobs')
      .update({
        status: 'failed',
        error_code: 'portrait_insert_failed',
        error_message: portraitErr?.message ?? 'unknown',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    await releaseClaimedSeed();
    await refundDraftRender('portrait_insert_failed');
    return err(
      'server_error',
      portraitErr?.message ?? 'portrait insert failed',
      500,
    );
  }

  await supabase
    .from('characters')
    .update({
      portrait_id: portrait.id,
      portrait_prompt_resolved: result.resolved_prompt,
    })
    .eq('id', character.id);

  // Render the avatar alongside the fighter, so a character has both images
  // from the moment it first exists.
  //
  // Until now the creation flow produced only the full-body render and nothing
  // ever made an avatar unless the player went to the edit screen and paid for
  // one -- which is why battle strips crop the full-body image for most
  // characters. Same seed, so the two read as the same person.
  //
  // Failure here is not fatal: creation is free, the fighter render is what the
  // player is looking at, and a missing avatar degrades to the existing crop.
  const avatar = await renderOnePortrait({
    supabase,
    userId,
    character,
    kind: 'avatar',
    promptRaw,
    artStyle,
    traits,
    itemFragment,
    seed,
    jobKind: 'generate',
  });

  if (avatar.ok) {
    await supabase
      .from('characters')
      .update({ avatar_portrait_id: avatar.portraitId })
      .eq('id', character.id);
    await supabase
      .from('character_portraits')
      .update({ appearance_version: stampVersion })
      .eq('id', avatar.portraitId);
  } else {
    console.warn('avatar leg failed during first generation; fighter kept', {
      character_id: character.id,
      code: avatar.code,
    });
  }

  await supabase
    .from('portrait_jobs')
    .update({
      status: 'succeeded',
      provider: result.provider,
      provider_model: result.provider_model,
      result_portrait_id: portrait.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  // Counted only on success: a provider failure must not burn an allowance the
  // player got nothing for.
  const rendersAfter = rendersUsed + 1;
  if (isDraft) {
    await supabase
      .from('characters')
      .update({ draft_portrait_renders: rendersAfter })
      .eq('id', character.id);
  }

  return ok({
    portrait_id: portrait.id,
    job_id: job.id,
    image_path: storagePath,
    provider: result.provider,
    provider_model: result.provider_model,
    credits_spent: creditsSpent,
    free_renders_left: isDraft
      ? Math.max(0, DRAFT_FREE_RENDERS - rendersAfter)
      : 0,
  });
});
