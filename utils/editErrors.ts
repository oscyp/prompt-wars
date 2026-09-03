/**
 * Turning Edge Function error codes into something a player can act on.
 *
 * The Edge Functions return `{ ok: false, error: { code, message } }` where the
 * message is written for a developer -- the cooldown path, for instance,
 * returns a bare ISO timestamp. Every wrapper in `utils/characters.ts` used to
 * collapse that envelope into `new Error(message)`, discarding the code, so the
 * only thing the UI could show was the developer string. `EditError` keeps the
 * code (and any structured fields) so `describeEditError` can write real copy.
 */

import { insufficientCreditsMessage } from '@/utils/credits';

/** One identity field the server refused because it is still on cooldown. */
export interface CooldownField {
  field: string;
  retryAfterSeconds: number;
}

/** Error carrying the Edge Function's code and structured fields. */
export class EditError extends Error {
  code: string;
  retryAfterSeconds?: number;
  shortfall?: number;
  /** Balance at the time of the refused spend, when the server sent it. */
  balance?: number;
  /** Price of the refused spend, when the server sent it. */
  price?: number;
  /** Every blocked identity field, when the server sent the breakdown. */
  fields?: CooldownField[];

  constructor(
    code: string,
    message: string,
    extra?: {
      retryAfterSeconds?: number;
      shortfall?: number;
      balance?: number;
      price?: number;
      fields?: CooldownField[];
    },
  ) {
    super(message);
    this.name = 'EditError';
    this.code = code;
    this.retryAfterSeconds = extra?.retryAfterSeconds;
    this.shortfall = extra?.shortfall;
    this.balance = extra?.balance;
    this.price = extra?.price;
    this.fields = extra?.fields;
  }
}

interface ErrorEnvelope {
  ok: boolean;
  error?: {
    code: string;
    message: string;
    retry_after_seconds?: number;
    shortfall?: number;
    balance?: number;
    price?: number;
    fields?: { field: string; retry_after_seconds: number }[];
  };
}

/**
 * Throw an `EditError` from a failed function envelope. Use in place of
 * `throw new Error(response.error?.message)` so the code survives.
 */
export function throwEditError(
  response: ErrorEnvelope,
  fallbackMessage: string,
): never {
  const e = response.error;
  throw new EditError(e?.code ?? 'unknown', e?.message ?? fallbackMessage, {
    retryAfterSeconds: e?.retry_after_seconds,
    shortfall: e?.shortfall,
    balance: e?.balance,
    price: e?.price,
    fields: Array.isArray(e?.fields)
      ? e.fields
          .filter((f) => f && typeof f.field === 'string')
          .map((f) => ({
            field: f.field,
            retryAfterSeconds: Number(f.retry_after_seconds ?? 0),
          }))
      : undefined,
  });
}

/**
 * Human phrasing for a duration. Deliberately coarse -- "in about 4 hours"
 * is more useful than a ticking countdown for a 24-hour gate.
 */
export function formatRetryAfter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'shortly';
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) return `in about ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `in about ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(seconds / 86400);
  return `in about ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Recover a retry delay when the server sent only prose. `edit-character` now
 * returns `retry_after_seconds`, but older deployments (and any function not
 * yet updated) still embed an ISO timestamp in the message.
 */
function retrySecondsFrom(err: EditError): number | undefined {
  if (typeof err.retryAfterSeconds === 'number') return err.retryAfterSeconds;
  const match = err.message.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
  if (!match) return undefined;
  const at = new Date(match[0]).getTime();
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, (at - Date.now()) / 1000);
}

/** Player-facing names for the identity columns the server reports. */
const IDENTITY_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  archetype: 'Archetype',
  battle_cry: 'Battle cry',
  signature_color: 'Signature colour',
};

function fieldLabel(field: string): string {
  return IDENTITY_FIELD_LABELS[field] ?? field;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The cooldown message, naming every blocked field when the server said which.
 *
 * The identity batch refuses the whole save if any field is locked and lists
 * all of them, so the player can fix the save in one pass rather than
 * discovering the locks one rejection at a time.
 */
function cooldownMessage(err: EditError): string {
  const fields = (err.fields ?? []).filter((f) => f.field);
  if (fields.length === 0) {
    const secs = retrySecondsFrom(err);
    return `You can change this again ${
      secs === undefined ? 'soon' : formatRetryAfter(secs)
    }.`;
  }
  if (fields.length === 1) {
    const [f] = fields;
    return `${fieldLabel(f.field)} is still locked. It unlocks ${formatRetryAfter(
      f.retryAfterSeconds,
    )}.`;
  }
  const names = fields.map((f) => fieldLabel(f.field));
  const unlocks = fields
    .map(
      (f) => `${fieldLabel(f.field)} ${formatRetryAfter(f.retryAfterSeconds)}`,
    )
    .join('; ');
  return `${joinNames(names)} are still locked. ${unlocks}.`;
}

export interface EditErrorCopy {
  title: string;
  message: string;
}

/**
 * Player-facing copy for a failed edit. Never returns a raw server string for a
 * code we recognise.
 */
export function describeEditError(
  err: unknown,
  fallbackTitle = 'That didn’t work',
): EditErrorCopy {
  if (!(err instanceof EditError)) {
    return {
      title: fallbackTitle,
      message:
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong. Please try again.',
    };
  }

  switch (err.code) {
    case 'cooldown':
      return { title: 'Not yet', message: cooldownMessage(err) };
    case 'battle_locked':
      return {
        title: 'Locked during battle',
        message:
          'Finish your battle first — your character can’t change mid-fight.',
      };
    case 'insufficient_credits':
      return {
        title: 'Not enough credits',
        message: insufficientCreditsMessage(err.shortfall),
      };
    case 'moderation_rejected':
      return {
        title: 'Rejected',
        message:
          'That wording didn’t pass moderation. Try describing it a different way.',
      };
    case 'all_providers_failed':
    case 'timeout':
    case 'provider_error':
      return {
        title: 'Couldn’t reach the art service',
        message:
          'The render failed and you have not been charged. Please try again in a moment.',
      };
    case 'storage_error':
      return {
        title: 'Couldn’t save the image',
        message:
          'The render worked but saving it failed, so you have been refunded. Please try again.',
      };
    case 'avatar_current':
      return {
        title: 'Avatar is up to date',
        message: 'Your avatar already matches this render.',
      };
    case 'fighter_stale':
      return {
        title: 'Draw the full look first',
        message:
          'Your fighter render is out of date, so a new avatar would not match it. Draw this look to redraw both.',
      };
    case 'conflict':
      return {
        title: 'Already up to date',
        message: 'Something changed while you were editing. Reopen and retry.',
      };
    case 'unauthorized':
      return {
        title: 'Signed out',
        message: 'Please sign in again to keep editing.',
      };
    default:
      return { title: fallbackTitle, message: err.message };
  }
}

export interface EditErrorAction {
  label: string;
  route: '/(profile)/wallet';
}

/**
 * The one thing a player can do about an error, when there is one.
 *
 * Only running out of credits has a remedy the app can offer (the wallet). Every
 * other code is either a wait or a retry, which the copy already says.
 */
export function editErrorAction(err: unknown): EditErrorAction | null {
  if (err instanceof EditError && err.code === 'insufficient_credits') {
    return { label: 'Top up', route: '/(profile)/wallet' };
  }
  return null;
}
