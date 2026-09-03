// Pure helpers for the render-look function (regenerate-portrait): which mode a
// request asked for, whether a free avatar retry is allowed, and how a replayed
// request is answered. Kept free of I/O so the rules are unit-testable without
// a database.

export type RenderMode = 'render' | 'random' | 'avatar_only';

/** Unknown or missing modes fall back to the plain redraw, never to a paid extra. */
export function resolveRenderMode(mode: unknown): RenderMode {
  if (mode === 'random') return 'random';
  if (mode === 'avatar_only') return 'avatar_only';
  return 'render';
}

export interface VersionedPortrait {
  id: string;
  /** `character_portraits.appearance_version`; NULL on rows predating the column. */
  appearance_version: number | null;
}

export interface AvatarRetryInput {
  character: { appearance_version: number | null };
  /** The row `characters.portrait_id` points at, or null when there is none. */
  fighter: VersionedPortrait | null;
  /** The row `characters.avatar_portrait_id` points at, or null when there is none. */
  avatar: VersionedPortrait | null;
}

export type AvatarRetryEligibility =
  | { eligible: true; appearanceVersion: number }
  | {
      eligible: false;
      code: 'conflict' | 'fighter_stale' | 'avatar_current';
      message: string;
      status: 409;
    };

/**
 * The free avatar retry exists for exactly one situation: `render_look` was
 * paid for, the fighter landed, and the avatar leg failed (or the avatar was
 * never produced). Everything else is a paid render in disguise, so the guard
 * is deliberately narrow.
 *
 * - No fighter: nothing to pair an avatar with -> `conflict`.
 * - Fighter older than the character: the player changed the look since; the
 *   retry would draw a stale avatar for a stale fighter -> `fighter_stale`.
 * - Avatar at or past the fighter's version: already current -> `avatar_current`.
 *   A NULL avatar version counts as current, matching the column comment
 *   ("treat NULL as up to date"), so the pre-column amnesty cannot be redrawn
 *   for free.
 */
export function avatarRetryEligibility(
  input: AvatarRetryInput,
): AvatarRetryEligibility {
  const { character, fighter, avatar } = input;
  if (!fighter) {
    return {
      eligible: false,
      code: 'conflict',
      message: 'character has no fighter render to pair an avatar with',
      status: 409,
    };
  }
  const fighterVersion = fighter.appearance_version ?? 0;
  const characterVersion = character.appearance_version ?? 0;
  if (fighterVersion !== characterVersion) {
    return {
      eligible: false,
      code: 'fighter_stale',
      message: 'the fighter render is out of date; render the look instead',
      status: 409,
    };
  }
  if (avatar) {
    const avatarVersion = avatar.appearance_version ?? fighterVersion;
    if (avatarVersion >= fighterVersion) {
      return {
        eligible: false,
        code: 'avatar_current',
        message: 'the avatar already matches the fighter render',
        status: 409,
      };
    }
  }
  return { eligible: true, appearanceVersion: fighterVersion };
}

/** The response every mode of regenerate-portrait returns. */
export interface RenderLookResponse {
  /** The live fighter render (unchanged by `avatar_only`). */
  portrait_id: string | null;
  image_path: string | null;
  avatar_portrait_id: string | null;
  avatar_image_path: string | null;
  /** True when the fighter landed but the avatar did not. Retry it free. */
  avatar_pending: boolean;
  /** The fighter's job for render/random; the avatar's job for avatar_only. */
  job_id: string | null;
  /** Reserved for a future asynchronous avatar leg. Always null while the leg is synchronous. */
  avatar_job_id: null;
  edit_id: string | null;
  credits_spent: number;
  mode: RenderMode;
  idempotent?: true;
}

export interface ReplayEditRow {
  id: string;
  edit_kind?: string | null;
  after: Record<string, unknown> | null;
  credits_spent: number | null;
}

export interface ReplayPortraitRow {
  id: string;
  image_path: string | null;
  generation_job_id: string | null;
}

/** The portrait rows a replay needs to load to rebuild its response. */
export function replayPortraitIds(edit: ReplayEditRow): string[] {
  const after = edit.after ?? {};
  return [after.portrait_id, after.avatar_portrait_id].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
}

/**
 * Rebuilds the original success response from the audit row a replayed request
 * matched. A replay must be indistinguishable from the first answer: the client
 * requires `job_id` and reads `portrait_id`/`image_path` to show the result, so
 * `{ idempotent, edit_id, after }` -- the old replay body -- made it throw.
 */
export function replayResponseFromEdit(
  edit: ReplayEditRow,
  portraitsById: Record<string, ReplayPortraitRow>,
): RenderLookResponse {
  const after = edit.after ?? {};
  const portraitId =
    typeof after.portrait_id === 'string' ? after.portrait_id : null;
  const avatarId =
    typeof after.avatar_portrait_id === 'string'
      ? after.avatar_portrait_id
      : null;
  // Rows written before `mode` was recorded are told apart by edit_kind: the
  // random shuffle has always been logged as 'traits'.
  const mode =
    after.mode !== undefined
      ? resolveRenderMode(after.mode)
      : edit.edit_kind === 'traits'
        ? 'random'
        : 'render';

  const fighter = portraitId ? portraitsById[portraitId] : undefined;
  const avatar = avatarId ? portraitsById[avatarId] : undefined;

  return {
    portrait_id: portraitId,
    image_path: fighter?.image_path ?? null,
    avatar_portrait_id: avatarId,
    avatar_image_path: avatar?.image_path ?? null,
    avatar_pending: avatarId === null,
    job_id:
      mode === 'avatar_only'
        ? (avatar?.generation_job_id ?? null)
        : (fighter?.generation_job_id ?? null),
    avatar_job_id: null,
    edit_id: edit.id,
    credits_spent: edit.credits_spent ?? 0,
    mode,
    idempotent: true,
  };
}
