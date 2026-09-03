// One render, start to finish: prompt assembly, provider call, storage upload,
// portrait row.
//
// Extracted because a render now produces TWO images. The fighter portrait and
// the avatar are two framings of one character -- selling somebody their own
// face as a separate purchase was a storage detail (two character_portraits
// rows) leaking into the product -- so `render_look` runs this twice and charges
// once. Copying a 150-line pipeline to do that would have been the worse half of
// the trade.
//
// Deliberately does no charging, refunding or character patching: the caller
// owns the money and decides what a partial failure means. That is what lets the
// fighter leg refund in full while a failed avatar leg keeps the paid portrait.

import {
  generateCharacterPortrait,
  ImageProviderError,
  SafetyRefusedError,
} from './image-provider.ts';
import type {
  Archetype,
  ArtStyle,
  PortraitKind,
  PortraitTraits,
} from './portrait-prompt-resolver.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RenderPortraitInput {
  supabase: Db;
  userId: string;
  // deno-lint-ignore no-explicit-any
  character: Record<string, any>;
  kind: PortraitKind;
  /** Empty string means "describe from traits" -- the resolver's guided path. */
  promptRaw: string;
  artStyle: ArtStyle;
  traits: PortraitTraits;
  itemFragment?: string;
  seed: number;
  /** Distinguishes a first generation from a re-render in portrait_jobs. */
  jobKind: 'generate' | 'regenerate';
  idempotencyKey?: string | null;
}

export interface RenderPortraitSuccess {
  ok: true;
  portraitId: string;
  imagePath: string;
  resolvedPrompt: string;
  provider: string;
  providerModel: string;
  jobId: string | null;
}

export interface RenderPortraitFailure {
  ok: false;
  /** Maps to the error code the caller returns, and to the job's error_code. */
  code: string;
  message: string;
  status: number;
}

export type RenderPortraitResult =
  | RenderPortraitSuccess
  | RenderPortraitFailure;

/**
 * Renders one image and records it, leaving `characters` untouched.
 *
 * The portrait row is inserted with `is_current = true` after demoting the
 * previous current row OF THE SAME KIND only -- without that filter, rendering a
 * fighter silently retires the avatar and the character is back to one live
 * image.
 */
export async function renderOnePortrait(
  input: RenderPortraitInput,
): Promise<RenderPortraitResult> {
  const {
    supabase,
    userId,
    character,
    kind,
    promptRaw,
    artStyle,
    traits,
    itemFragment,
    seed,
    jobKind,
    idempotencyKey = null,
  } = input;

  const { data: job } = await supabase
    .from('portrait_jobs')
    .insert({
      character_id: character.id,
      profile_id: userId,
      kind: jobKind,
      portrait_kind: kind,
      status: 'running',
      seed,
      prompt_payload: {
        raw: promptRaw,
        traits,
        archetype: character.archetype,
        signature_color: character.signature_color,
        signature_item_fragment: itemFragment ?? null,
        art_style: artStyle,
      },
      idempotency_key: idempotencyKey ? `${idempotencyKey}:${kind}` : null,
      attempt: 1,
    })
    .select('id')
    .single();

  const failJob = async (code: string, message: string): Promise<void> => {
    if (!job?.id) return;
    await supabase
      .from('portrait_jobs')
      .update({
        status:
          code === 'moderation_rejected' ? 'moderation_rejected' : 'failed',
        error_code: code,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  };

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
      // Both kinds share the character's immutable portrait_seed so the avatar
      // and the fighter read as the same character rather than two people.
      kind,
    });
  } catch (e) {
    const code =
      e instanceof SafetyRefusedError
        ? 'moderation_rejected'
        : e instanceof ImageProviderError
          ? e.code
          : 'provider_error';
    const message = e instanceof Error ? e.message : String(e);
    await failJob(code, message);
    return { ok: false, code, message, status: 502 };
  }

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
    await failJob('storage_upload_failed', uploadRes.error.message);
    return {
      ok: false,
      code: 'storage_error',
      message: uploadRes.error.message,
      status: 500,
    };
  }

  await supabase
    .from('character_portraits')
    .update({ is_current: false })
    .eq('character_id', character.id)
    .eq('kind', kind)
    .eq('is_current', true);

  const { data: portrait, error: insertErr } = await supabase
    .from('character_portraits')
    .insert({
      id: portraitId,
      character_id: character.id,
      profile_id: userId,
      image_path: storagePath,
      kind,
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
      generation_job_id: job?.id ?? null,
      is_current: true,
      moderation_status: 'approved',
      // Stamped by the caller once the character patch has settled: this write
      // can bump characters.appearance_version, and reading it beforehand marks
      // a render stale the instant it is produced.
      appearance_version: null,
    })
    .select('id')
    .single();

  if (insertErr || !portrait) {
    const message = insertErr?.message ?? 'portrait insert failed';
    await failJob('portrait_insert_failed', message);
    return { ok: false, code: 'server_error', message, status: 500 };
  }

  if (job?.id) {
    await supabase
      .from('portrait_jobs')
      .update({
        status: 'succeeded',
        provider: result.provider,
        provider_model: result.provider_model,
        result_portrait_id: portraitId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }

  return {
    ok: true,
    portraitId,
    imagePath: storagePath,
    resolvedPrompt: result.resolved_prompt,
    provider: result.provider,
    providerModel: result.provider_model,
    jobId: job?.id ?? null,
  };
}

/** Builds the trait bundle the resolver expects from a character row. */
// deno-lint-ignore no-explicit-any
export function traitsFromCharacter(
  character: Record<string, any>,
): PortraitTraits {
  return {
    vibe: character.vibe ?? undefined,
    silhouette: character.silhouette ?? undefined,
    palette: character.palette_key ?? undefined,
    era: character.era ?? undefined,
    expression: character.expression ?? undefined,
  };
}

/** Looks up the equipped item's prompt fragment, if any. */
export async function itemFragmentFor(
  supabase: Db,
  signatureItemId: string | null | undefined,
): Promise<string | undefined> {
  if (!signatureItemId) return undefined;
  const { data } = await supabase
    .from('signature_items')
    .select('prompt_fragment')
    .eq('id', signatureItemId)
    .maybeSingle();
  return data?.prompt_fragment ?? undefined;
}
