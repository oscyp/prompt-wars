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

/** Error carrying the Edge Function's code and structured fields. */
export class EditError extends Error {
  code: string;
  retryAfterSeconds?: number;
  shortfall?: number;

  constructor(
    code: string,
    message: string,
    extra?: { retryAfterSeconds?: number; shortfall?: number },
  ) {
    super(message);
    this.name = 'EditError';
    this.code = code;
    this.retryAfterSeconds = extra?.retryAfterSeconds;
    this.shortfall = extra?.shortfall;
  }
}

interface ErrorEnvelope {
  ok: boolean;
  error?: {
    code: string;
    message: string;
    retry_after_seconds?: number;
    shortfall?: number;
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
    case 'cooldown': {
      const secs = retrySecondsFrom(err);
      return {
        title: 'Not yet',
        message: `You can change this again ${
          secs === undefined ? 'soon' : formatRetryAfter(secs)
        }.`,
      };
    }
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
