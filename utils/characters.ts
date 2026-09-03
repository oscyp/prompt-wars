/**
 * Character + portrait Edge Function wrappers.
 *
 * All calls go through `supabase.functions.invoke()` and pass a client-generated
 * idempotency key. Portrait jobs are polled via a realtime channel on
 * `portrait_jobs` scoped to the current profile.
 *
 * The backend remains the source of truth for pricing, moderation, and
 * trait validity. This module never decides outcomes.
 */

import { invokeAuthenticatedFunction, supabase } from './supabase';
import { EditError, throwEditError } from './editErrors';
import {
  Vibe,
  Silhouette,
  Era,
  Expression,
  PaletteKey,
  ItemClass,
  ArchetypeForTraits,
  ArtStyle,
  PALETTE_HEX,
  VIBES,
  SILHOUETTES,
  ERAS,
  EXPRESSIONS,
} from '@/constants/CharacterTraits';

// ---------------------------------------------------------------------------
// UUID v4 (RN doesn't ship crypto.randomUUID on older runtimes)
// ---------------------------------------------------------------------------

/**
 * RFC4122 v4 UUID using Math.random.
 * Not cryptographically secure; sufficient as an idempotency key.
 */
export function generateIdempotencyKey(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += hex[((Math.random() * 4) | 0) + 8];
    } else {
      out += hex[(Math.random() * 16) | 0];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraitSet {
  vibe?: Vibe;
  silhouette?: Silhouette;
  palette?: PaletteKey;
  era?: Era;
  expression?: Expression;
}

export interface GeneratePortraitInput {
  characterId?: string;
  archetype: ArchetypeForTraits;
  mode: 'prompt' | 'guided';
  prompt?: string;
  traits?: TraitSet;
  artStyle?: ArtStyle;
}

export interface PortraitJobResult {
  jobId: string;
  portraitId: string;
  imageUrl: string;
  seed: string;
  status: 'succeeded';
  /**
   * Free draft re-rolls remaining, from `generate-portrait`.
   *
   * Creation gives three free renders and then charges the normal render price,
   * so the flow has to be able to say which one the player is on before they
   * tap again. Absent once the character is finalized.
   */
  freeRendersLeft?: number;
  /** Credits this render cost. 0 while the free allowance lasts. */
  creditsSpent?: number;
  /** The avatar drawn alongside the fighter, when the server reported one. */
  avatarPortraitId?: string | null;
  avatarImageUrl?: string | null;
  /**
   * True when the fighter landed but the avatar did not. `undefined` means the
   * deployed server predates the field; derive the state after reloading the
   * character instead.
   */
  avatarPending?: boolean;
  /** Set when the avatar leg is still running server-side (async deployments). */
  avatarJobId?: string | null;
  /** True when this was a replay of an earlier request; nothing was charged. */
  idempotent?: boolean;
}

export interface RenderLookInput {
  characterId: string;
  /**
   * `render` redraws the saved look for `render_look`. `random` shuffles every
   * trait first and costs `random_character`. `avatar_only` redraws just the
   * avatar, free, when the fighter landed but the avatar leg failed.
   *
   * Nothing about the description travels in this request any more. Art style
   * and the custom prompt are free edits saved through `editCharacter`, so by
   * the time this runs the server already knows what to draw.
   */
  mode?: 'render' | 'random' | 'avatar_only';
}

export interface CreateCustomSignatureItemInput {
  name: string;
  description: string;
  itemClass: ItemClass;
  generateIcon?: boolean;
}

export interface CustomSignatureItem {
  id: string;
  name: string;
  description: string;
  itemClass: ItemClass;
  iconUrl?: string;
}

export interface CatalogSignatureItem {
  id: string;
  name: string;
  description: string;
  itemClass: ItemClass;
  iconUrl?: string;
  /** True for the caller's own creations; absent/false for shared catalog items. */
  isCustom?: boolean;
}

/** Fields the batched `identity` edit kind accepts. At least one is required. */
export interface IdentityChanges {
  name?: string;
  archetype?: string;
  battleCry?: string;
  /** Palette key or a raw `#RRGGBB` hex. */
  signatureColor?: PaletteKey | string;
}

/** Fields the batched `look` edit kind accepts. All free. */
export interface LookChanges {
  artStyle?: ArtStyle;
  /**
   * The player's own description. `null` clears it and returns the character to
   * the guided traits — the prompt resolver reads the traits again the moment
   * this is empty, so clearing it is what "switch back to Guided" means.
   */
  portraitPromptRaw?: string | null;
  palette?: PaletteKey;
  vibe?: string;
  silhouette?: string;
  era?: string;
  expression?: string;
  signatureItemId?: string;
}

export interface EditCharacterInput {
  characterId: string;
  changes: {
    /**
     * Apply any subset of name / archetype / battle cry / signature colour in
     * ONE request.
     *
     * The edit screen stages all four behind a single "Save changes" action, so
     * sending them as separate calls meant a cooldown rejection on the third
     * field left the first two already committed, with no way to tell the
     * player which half of their edit survived. The server validates and
     * cooldown-checks every field before writing anything.
     *
     * Each field keeps its own cooldown (name 7d, archetype 14d, the other two
     * 24h) -- the batch is a transport detail, not a shared meter.
     */
    identity?: IdentityChanges;
    /**
     * Apply any subset of the describing fields in ONE free request.
     *
     * This replaces `swapTrait`, `setAllTraits` and `rerollAllTraits`, which
     * existed because traits were charged per swap and the screen had to pick
     * the cheapest route through them. A trait is an input to a render and no
     * image is generated when somebody taps through Vibe, so describing is free
     * and the money moved to `renderLook`. With nothing to price, there is
     * nothing to route: one call sets whatever changed.
     */
    look?: LookChanges;
  };
}

export interface EditCharacterResult {
  character: {
    id: string;
  };
  edit_id: string | null;
  credits_spent: number;
  /** Identity batches only: the fields that actually changed. */
  applied?: string[];
  /** Identity batches only: true when every staged field already held its value. */
  unchanged?: boolean;
}

interface FunctionEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

type EditCharacterInvokeRequest = {
  edit_kind: 'identity' | 'look';
  payload: Record<string, unknown>;
};

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function toEditCharacterRequest(
  changes: EditCharacterInput['changes'],
): EditCharacterInvokeRequest {
  if (changes.identity) {
    const { name, archetype, battleCry, signatureColor } = changes.identity;
    const payload: Record<string, unknown> = {};
    if (typeof name === 'string') payload.name = name;
    if (typeof archetype === 'string') payload.archetype = archetype;
    if (typeof battleCry === 'string') payload.battle_cry = battleCry;
    if (signatureColor != null) {
      // The server stores hex; the UI may hand us a palette key.
      payload.signature_color =
        signatureColor in PALETTE_HEX
          ? PALETTE_HEX[signatureColor as PaletteKey]
          : signatureColor;
    }
    if (Object.keys(payload).length === 0) {
      throw new Error('An identity edit needs at least one field.');
    }
    return { edit_kind: 'identity', payload };
  }

  if (changes.look) {
    const l = changes.look;
    const payload: Record<string, unknown> = {};
    if (l.artStyle) payload.art_style = l.artStyle;
    if (l.palette) payload.palette_key = l.palette;
    if (l.vibe) payload.vibe = l.vibe;
    if (l.silhouette) payload.silhouette = l.silhouette;
    if (l.era) payload.era = l.era;
    if (l.expression) payload.expression = l.expression;
    if (l.signatureItemId) payload.signature_item_id = l.signatureItemId;
    // Presence, not truthiness: null is the meaningful value here, and `if
    // (l.portraitPromptRaw)` would silently drop every attempt to clear it.
    if ('portraitPromptRaw' in l) {
      payload.portrait_prompt_raw = l.portraitPromptRaw ?? null;
    }
    if (Object.keys(payload).length === 0) {
      throw new Error('A look edit needs at least one field.');
    }
    return { edit_kind: 'look', payload };
  }

  throw new Error('No supported character edit was provided.');
}

// ---------------------------------------------------------------------------
// Portrait job polling via realtime
// ---------------------------------------------------------------------------

const PORTRAIT_JOB_TIMEOUT_MS = 90_000;

type PortraitJobRow = {
  id: string;
  status:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'failed'
    | 'moderation_rejected'
    | 'cancelled';
  result_portrait_id: string | null;
  seed: string | null;
  error_message: string | null;
};

const PORTRAIT_BUCKET = 'character-portraits';
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Sign a storage path from `character_portraits.image_path`.
 *
 * Exported because the edit screen and the shop each carried their own copy of
 * this call; three signers for one bucket is two too many.
 */
export async function signPortraitUrl(imagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to sign portrait URL.');
  }
  return data.signedUrl;
}

/** Portrait id → signed URL. Throws when the row or path is missing. */
export async function resolvePortraitImageUrl(
  portraitId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('character_portraits')
    .select('image_path')
    .eq('id', portraitId)
    .maybeSingle();
  if (error || !data?.image_path) {
    throw new Error(error?.message || 'Portrait record not found.');
  }
  return signPortraitUrl(data.image_path as string);
}

/**
 * What the renderers write into `character_portraits.prompt_snapshot`.
 *
 * `art_style` arrived later than the rest; on older rows it is absent and the
 * diff must treat it as unknown rather than changed.
 */
export interface PortraitPromptSnapshot {
  raw?: string | null;
  resolved?: string | null;
  traits?: {
    vibe?: string | null;
    silhouette?: string | null;
    palette?: string | null;
    era?: string | null;
    expression?: string | null;
  } | null;
  archetype?: string | null;
  signature_color?: string | null;
  signature_item_id?: string | null;
  art_style?: string | null;
}

export interface PortraitRef {
  url: string | null;
  appearanceVersion: number | null;
  snapshot: PortraitPromptSnapshot | null;
}

const EMPTY_PORTRAIT_REF: PortraitRef = {
  url: null,
  appearanceVersion: null,
  snapshot: null,
};

/**
 * Everything the edit screen needs about one render, in one read: a signed
 * URL, the appearance version it was drawn at (for staleness), and the prompt
 * snapshot (for "what changed since"). Never throws; a missing row or failed
 * signature yields nulls so the screen can fall back to the placeholder.
 */
export async function loadPortraitRef(
  portraitId: string,
): Promise<PortraitRef> {
  const { data } = await supabase
    .from('character_portraits')
    .select('image_path, appearance_version, prompt_snapshot')
    .eq('id', portraitId)
    .maybeSingle();
  const row = data as {
    image_path: string | null;
    appearance_version: number | null;
    prompt_snapshot: PortraitPromptSnapshot | null;
  } | null;
  if (!row?.image_path) return EMPTY_PORTRAIT_REF;
  const url = await signPortraitUrl(row.image_path).catch(() => null);
  return {
    url,
    appearanceVersion: row.appearance_version,
    snapshot: row.prompt_snapshot ?? null,
  };
}

async function waitForPortraitJob(
  profileId: string,
  jobId: string,
): Promise<PortraitJobResult> {
  return new Promise<PortraitJobResult>((resolve, reject) => {
    let settled = false;

    const settleResolve = (result: PortraitJobResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
      resolve(result);
    };
    const settleReject = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
      reject(err);
    };

    const handleRow = (row: PortraitJobRow | null) => {
      if (!row || row.id !== jobId) return;
      if (row.status === 'succeeded' && row.result_portrait_id) {
        const portraitId = row.result_portrait_id;
        const seed = row.seed ?? '';
        resolvePortraitImageUrl(portraitId)
          .then((imageUrl) => {
            settleResolve({
              jobId: row.id,
              portraitId,
              imageUrl,
              seed,
              status: 'succeeded',
            });
          })
          .catch((err: Error) => settleReject(err));
      } else if (
        row.status === 'failed' ||
        row.status === 'moderation_rejected' ||
        row.status === 'cancelled'
      ) {
        settleReject(
          new Error(
            row.error_message ||
              (row.status === 'moderation_rejected'
                ? 'Portrait was rejected by moderation.'
                : row.status === 'cancelled'
                  ? 'Portrait generation was cancelled.'
                  : 'Portrait generation failed.'),
          ),
        );
      }
    };

    const channel = supabase
      .channel(`portrait_jobs:${profileId}:${jobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portrait_jobs',
          filter: `profile_id=eq.${profileId}`,
        },
        (payload) => {
          handleRow(payload.new as PortraitJobRow);
        },
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Catch jobs that already completed before we subscribed.
          const { data, error } = await supabase
            .from('portrait_jobs')
            .select('id,status,result_portrait_id,seed,error_message')
            .eq('id', jobId)
            .maybeSingle();
          if (!error && data) {
            handleRow(data as PortraitJobRow);
          }
        }
      });

    const timeout = setTimeout(() => {
      // A coded error, so the screen can tell "may still land" from "failed".
      settleReject(
        new EditError(
          'timeout',
          "Your portrait is taking longer than usual. We'll keep working on it.",
        ),
      );
    }, PORTRAIT_JOB_TIMEOUT_MS);
  });
}

/**
 * Wait for an avatar job started by a server that runs the avatar leg in the
 * background. Resolves with the signed image once `portrait_jobs` succeeds.
 */
export async function awaitAvatarJob(
  avatarJobId: string,
): Promise<{ portraitId: string; imageUrl: string }> {
  const profileId = await getCurrentProfileId();
  const result = await waitForPortraitJob(profileId, avatarJobId);
  return { portraitId: result.portraitId, imageUrl: result.imageUrl };
}

async function getCurrentProfileId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('You must be signed in.');
  }
  return user.id;
}

// ---------------------------------------------------------------------------
// Edge Function wrappers
// ---------------------------------------------------------------------------

export interface PortraitJobStartResponse {
  free_renders_left?: number;
  credits_spent?: number;
  job_id?: string;
  portrait_id?: string;
  image_path?: string;
  seed?: string | number;
  provider?: string;
  provider_model?: string;
  avatar_portrait_id?: string | null;
  avatar_image_path?: string | null;
  avatar_pending?: boolean;
  avatar_job_id?: string | null;
  mode?: string;
  idempotent?: boolean;
  /** Older replay shape: `{ idempotent, edit_id, after: { portrait_id, … } }`. */
  after?: { portrait_id?: string; avatar_portrait_id?: string | null };
}

export type PortraitJobShape =
  | {
      kind: 'sync';
      jobId: string;
      portraitId: string;
      imagePath: string;
      avatarPortraitId: string | null;
      avatarImagePath: string | null;
      avatarPending: boolean | undefined;
      avatarJobId: string | null;
      seed: string;
      creditsSpent?: number;
      freeRendersLeft?: number;
      idempotent: boolean;
    }
  | {
      kind: 'replay';
      portraitId: string;
      avatarPortraitId: string | null;
      creditsSpent?: number;
    }
  | { kind: 'job'; jobId: string }
  | { kind: 'invalid' };

/**
 * Classify a portrait-function response before touching the network again.
 *
 * Pure so it can be tested against every shape the deployed functions have
 * ever returned: the synchronous happy path, the job-id-only fallback, the
 * OLD idempotent replay (`{ idempotent, edit_id, after }`, no `job_id`) that
 * used to make this wrapper throw, and the current replay which carries the
 * full shape.
 */
export function normalizePortraitJobResponse(
  data: PortraitJobStartResponse | null | undefined,
): PortraitJobShape {
  if (!data) return { kind: 'invalid' };
  if (data.portrait_id && data.image_path) {
    const avatarPortraitId = data.avatar_portrait_id ?? null;
    return {
      kind: 'sync',
      jobId: data.job_id ?? '',
      portraitId: data.portrait_id,
      imagePath: data.image_path,
      avatarPortraitId,
      avatarImagePath: data.avatar_image_path ?? null,
      avatarPending:
        typeof data.avatar_pending === 'boolean'
          ? data.avatar_pending
          : data.avatar_portrait_id === undefined
            ? undefined
            : data.avatar_portrait_id === null,
      avatarJobId: data.avatar_job_id ?? null,
      seed: data.seed != null ? String(data.seed) : '',
      creditsSpent: data.credits_spent,
      freeRendersLeft: data.free_renders_left,
      idempotent: data.idempotent === true,
    };
  }
  if (data.idempotent && data.after?.portrait_id) {
    return {
      kind: 'replay',
      portraitId: data.after.portrait_id,
      avatarPortraitId: data.after.avatar_portrait_id ?? null,
      creditsSpent: data.credits_spent,
    };
  }
  if (data.job_id) return { kind: 'job', jobId: data.job_id };
  return { kind: 'invalid' };
}

async function startPortraitJob(
  functionName: 'generate-portrait' | 'regenerate-portrait',
  body: Record<string, unknown>,
): Promise<PortraitJobResult> {
  const profileId = await getCurrentProfileId();
  const idempotencyKey = generateIdempotencyKey();

  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<PortraitJobStartResponse>
  >(functionName, {
    ...body,
    idempotency_key: idempotencyKey,
  });

  if (!response.ok) {
    throwEditError(response, 'Failed to start portrait generation.');
  }

  const shape = normalizePortraitJobResponse(response.data);

  switch (shape.kind) {
    case 'sync': {
      // Happy path: the Edge Function returned the completed render(s).
      const [imageUrl, avatarImageUrl] = await Promise.all([
        signPortraitUrl(shape.imagePath),
        shape.avatarImagePath
          ? signPortraitUrl(shape.avatarImagePath).catch(() => null)
          : Promise.resolve<string | null>(null),
      ]);
      return {
        jobId: shape.jobId,
        portraitId: shape.portraitId,
        imageUrl,
        seed: shape.seed,
        status: 'succeeded',
        freeRendersLeft: shape.freeRendersLeft,
        creditsSpent: shape.creditsSpent,
        avatarPortraitId: shape.avatarPortraitId,
        avatarImageUrl,
        avatarPending: shape.avatarPending,
        avatarJobId: shape.avatarJobId,
        idempotent: shape.idempotent,
      };
    }
    case 'replay': {
      // An older server acknowledged a replay with ids only. Nothing was
      // charged; resolve the images ourselves rather than failing the call.
      const [imageUrl, avatarImageUrl] = await Promise.all([
        resolvePortraitImageUrl(shape.portraitId),
        shape.avatarPortraitId
          ? resolvePortraitImageUrl(shape.avatarPortraitId).catch(() => null)
          : Promise.resolve<string | null>(null),
      ]);
      return {
        jobId: '',
        portraitId: shape.portraitId,
        imageUrl,
        seed: '',
        status: 'succeeded',
        creditsSpent: shape.creditsSpent ?? 0,
        avatarPortraitId: shape.avatarPortraitId,
        avatarImageUrl,
        avatarPending: shape.avatarPortraitId === null ? undefined : false,
        idempotent: true,
      };
    }
    case 'job':
      // Fallback: HTTP response only included job_id (async / dropped response).
      return waitForPortraitJob(profileId, shape.jobId);
    default:
      return throwEditError(response, 'Failed to start portrait generation.');
  }
}

export async function generatePortrait(
  input: GeneratePortraitInput,
): Promise<PortraitJobResult> {
  // The draft character row carries none of this yet -- traits and battle_cry
  // are only written at finalize -- so the creation-flow inputs have to travel
  // in the request body under the field names the Edge Function reads. Sending
  // `prompt` instead of `portrait_prompt_raw` silently dropped everything the
  // player typed and rendered from archetype alone.
  return startPortraitJob('generate-portrait', {
    character_id: input.characterId,
    portrait_prompt_raw: input.mode === 'prompt' ? input.prompt : undefined,
    traits: input.mode === 'guided' ? input.traits : undefined,
    art_style: input.artStyle,
  });
}

/**
 * The one paid action on the edit screen: draws the character's saved look as
 * both a full-body portrait and an avatar, for a single charge.
 *
 * These were two separate purchases, which meant players could buy their
 * fighter and then be asked to buy their own face. They are two framings of one
 * character and one seed; splitting them was a storage detail showing through.
 */
export async function renderLook(
  input: RenderLookInput,
): Promise<PortraitJobResult> {
  return startPortraitJob('regenerate-portrait', {
    character_id: input.characterId,
    mode: input.mode ?? 'render',
  });
}

/**
 * Redraw only the avatar, free, after the fighter landed without one.
 *
 * Offer this only when `pricing.prices.avatar_retry` exists: an older deployed
 * function coerces unknown modes to a full paid render.
 */
export async function retryAvatar(input: {
  characterId: string;
}): Promise<PortraitJobResult> {
  return startPortraitJob('regenerate-portrait', {
    character_id: input.characterId,
    mode: 'avatar_only',
  });
}

export interface PortraitHistoryEntry {
  portraitId: string;
  imageUrl: string;
  createdAt: string;
}

/**
 * Earlier renders for a character, newest first, excluding the live one.
 *
 * Read directly from `character_portraits` (RLS policy
 * `character_portraits_select_own`) rather than from
 * `characters.portrait_history`, which stores ids without the paths needed to
 * display them.
 */
export async function listPortraitHistory(
  characterId: string,
  kind: 'fighter' | 'avatar' = 'fighter',
  limit = 3,
): Promise<PortraitHistoryEntry[]> {
  const { data, error } = await supabase
    .from('character_portraits')
    .select('id, image_path, created_at, is_current, moderation_status')
    .eq('character_id', characterId)
    .eq('kind', kind)
    .eq('is_current', false)
    .neq('moderation_status', 'rejected')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const entries = await Promise.all(
    data.map(async (row) => {
      const imageUrl = await signPortraitUrl(row.image_path as string).catch(
        () => null,
      );
      return imageUrl
        ? {
            portraitId: row.id as string,
            imageUrl,
            createdAt: row.created_at as string,
          }
        : null;
    }),
  );
  return entries.filter((e): e is PortraitHistoryEntry => e !== null);
}

interface RestorePortraitResponse {
  portrait_id: string;
  avatar_portrait_id?: string | null;
  /** Absent on older deployments, which restore one image only. */
  avatar_restored?: boolean;
}

export interface RestorePortraitResult {
  portraitId: string;
  avatarPortraitId: string | null;
  /** True when the paired avatar was restored alongside the fighter. */
  avatarRestored: boolean;
}

/**
 * Point the character back at an earlier render. Free.
 *
 * The server restores the fighter and its paired avatar together. Against an
 * older deployment that restores one image, pass `fallbackAvatarId` (the
 * avatar that was current alongside that fighter) and it is restored with a
 * second call so the pair does not drift.
 */
export async function restorePortrait(input: {
  characterId: string;
  portraitId: string;
  fallbackAvatarId?: string | null;
}): Promise<RestorePortraitResult> {
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<RestorePortraitResponse>
  >('restore-portrait', {
    character_id: input.characterId,
    portrait_id: input.portraitId,
  });
  if (!response.ok || !response.data) {
    throwEditError(response, 'Failed to restore that render.');
  }
  const data = response.data;

  if (typeof data.avatar_restored === 'boolean') {
    return {
      portraitId: data.portrait_id,
      avatarPortraitId: data.avatar_portrait_id ?? null,
      avatarRestored: data.avatar_restored,
    };
  }

  // Older function: one image per call. Restore the known avatar ourselves.
  if (input.fallbackAvatarId) {
    const second = await invokeAuthenticatedFunction<
      FunctionEnvelope<RestorePortraitResponse>
    >('restore-portrait', {
      character_id: input.characterId,
      portrait_id: input.fallbackAvatarId,
    }).catch(() => null);
    if (second?.ok && second.data) {
      return {
        portraitId: data.portrait_id,
        avatarPortraitId: second.data.portrait_id,
        avatarRestored: true,
      };
    }
  }
  return {
    portraitId: data.portrait_id,
    avatarPortraitId: null,
    avatarRestored: false,
  };
}

export async function createCustomSignatureItem(
  input: CreateCustomSignatureItemInput,
): Promise<CustomSignatureItem> {
  const idempotencyKey = generateIdempotencyKey();
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<{ item: CustomSignatureItem }>
  >('create-custom-signature-item', {
    name: input.name,
    description: input.description,
    item_class: input.itemClass,
    prompt_fragment: input.description,
    with_image: input.generateIcon ?? false,
    idempotency_key: idempotencyKey,
  });
  if (!response.ok || !response.data?.item) {
    throwEditError(response, 'Failed to create signature item.');
  }
  return response.data.item;
}

export async function editCharacter(
  input: EditCharacterInput,
): Promise<EditCharacterResult> {
  const idempotencyKey = generateIdempotencyKey();
  const request = toEditCharacterRequest(input.changes);
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<EditCharacterResult>
  >('edit-character', {
    character_id: input.characterId,
    edit_kind: request.edit_kind,
    payload: request.payload,
    idempotency_key: idempotencyKey,
  });
  if (!response.ok || !response.data) {
    throwEditError(response, 'Failed to edit character.');
  }
  return response.data;
}

export async function listSignatureItemsCatalog(): Promise<
  CatalogSignatureItem[]
> {
  const response = await invokeAuthenticatedFunction<
    FunctionEnvelope<{ items: CatalogSignatureItem[] }>
  >('list-signature-items-catalog', {});
  if (!response.ok || !response.data?.items) {
    throwEditError(response, 'Failed to load signature items.');
  }
  return response.data.items;
}

// ---------------------------------------------------------------------------
// Fallback portrait
// ---------------------------------------------------------------------------

export interface FallbackPortraitInput {
  archetype: ArchetypeForTraits;
  signatureColor?: PaletteKey | string;
  itemClass?: ItemClass;
}

/** Brand purple, used when a character has no usable signature colour. */
export const DEFAULT_SIGNATURE_HEX = '#7C3AED';

/**
 * Resolves whatever a character carries as its signature colour into a hex.
 *
 * The column stores hex, but palette keys reach this code too (the creation
 * flow, and any caller that passes a `PaletteKey` straight through). This was
 * inlined in the portrait fallback and reimplemented with three different
 * defaults elsewhere, so a character with a blue signature could still be
 * framed in brand purple.
 */
export function resolveSignatureHex(
  color: PaletteKey | string | null | undefined,
): string {
  if (!color) return DEFAULT_SIGNATURE_HEX;
  if (color in PALETTE_HEX) return PALETTE_HEX[color as PaletteKey];
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
    return color;
  return DEFAULT_SIGNATURE_HEX;
}

/**
 * Returns a deterministic data-URI SVG used as the offline/loading placeholder.
 * Full-body (2:3) neutral silhouette tinted with the signature color. Matches
 * the aspect of server-generated full-body renders so it drops into the same
 * containers without layout shift.
 *
 * Deliberately carries no archetype initial: per the design language a
 * character is never an initial (docs/DESIGN_LANGUAGE.md §8). `archetype` is
 * still accepted so callers need not change; only the tint varies.
 */
export function getPortraitFallbackUri(input: FallbackPortraitInput): string {
  const tint = resolveSignatureHex(input.signatureColor);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 384" width="256" height="384">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${tint}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${tint}" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <rect width="256" height="384" fill="#111827"/>
  <ellipse cx="128" cy="352" rx="82" ry="14" fill="${tint}" opacity="0.25"/>
  <g fill="url(#g)" stroke="${tint}" stroke-width="3" stroke-linejoin="round">
    <circle cx="128" cy="74" r="34"/>
    <path d="M128 114
      c -30 0 -50 20 -54 48
      l -12 66 c -1 8 4 14 11 14 l 13 0
      l 6 66 c 1 8 6 14 13 14 l 8 0 l 7 -60 l 16 0 l 7 60 l 8 0
      c 7 0 12 -6 13 -14 l 6 -66 l 13 0
      c 7 0 12 -6 11 -14 l -12 -66
      c -4 -28 -24 -48 -54 -48 z"/>
  </g>
  <path d="M96 168 c 10 -10 54 -10 64 0" fill="none" stroke="#F9FAFB" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>
</svg>`;

  // base64 to be safe for RN `<Image>` data URIs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b64 = (globalThis as any).btoa
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).btoa(unescape(encodeURIComponent(svg)))
    : encodeBase64(svg);
  return `data:image/svg+xml;base64,${b64}`;
}

function encodeBase64(input: string): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let str = unescape(encodeURIComponent(input));
  let output = '';
  let i = 0;
  while (i < str.length) {
    const c1 = str.charCodeAt(i++);
    const c2 = str.charCodeAt(i++);
    const c3 = str.charCodeAt(i++);
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    const e3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6);
    const e4 = isNaN(c3) ? 64 : c3 & 63;
    output +=
      chars.charAt(e1) +
      chars.charAt(e2) +
      (e3 === 64 ? '=' : chars.charAt(e3)) +
      (e4 === 64 ? '=' : chars.charAt(e4));
  }
  return output;
}
