/**
 * Pure copy and parsers for the pre-battle screens (matchmaking, waiting).
 *
 * Kept out of the route files: Expo Router treats extra named exports on a
 * route as part of the screen module, which makes Fast Refresh full-reload the
 * screen on every edit and lets tests import a whole RN screen to check a
 * string. The strings live here; the screens only render them.
 */

import { BATTLE_MODES, type BattleMode } from '@/constants/BattleModes';
import type { MatchmakingResult } from '@/utils/battles';
import { formatRemaining } from '@/utils/battleCopy';

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

/**
 * The mode the sheet asked for, or ranked when the URL says something else.
 *
 * Deep links and stale notifications can carry any string; passing it straight
 * to the server produced a 400 the player could not read.
 */
export function resolveMatchmakingMode(
  raw: string | string[] | null | undefined,
): BattleMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const known = BATTLE_MODES.find((m) => m.mode === value);
  return known ? known.mode : 'ranked';
}

/** Local failure the screen raises when the player has no fighter to send. */
export const NO_ACTIVE_CHARACTER = 'no_active_character';

export interface MatchmakingErrorCopy {
  title: string;
  message: string;
  /** False when trying again cannot help (nothing to retry with). */
  canRetry: boolean;
}

/**
 * What to tell a player whose search failed.
 *
 * The server's prose is written for logs, never shown verbatim; the only
 * inputs matched on are the two failure strings the matchmaking function is
 * known to send.
 */
export function matchmakingErrorCopy(
  message: string | null | undefined,
): MatchmakingErrorCopy {
  const m = message ?? '';
  const title = "Couldn't find a match";
  if (m === NO_ACTIVE_CHARACTER) {
    return {
      title,
      message: 'You need an active character to battle.',
      canRetry: false,
    };
  }
  if (/too many battles created/i.test(m)) {
    return {
      title,
      message: "You've started a lot of battles. Try again in a few minutes.",
      canRetry: true,
    };
  }
  if (/cannot verify rate limits/i.test(m)) {
    return {
      title,
      message: "Couldn't check your limits. Try again.",
      canRetry: true,
    };
  }
  return { title, message: 'Something went wrong. Try again.', canRetry: true };
}

/**
 * The line under "Match found".
 *
 * A ranked or casual queue that came back with a bot must say so before the
 * face-off does: the player asked for a human and is about to meet a persona.
 */
export function matchFoundMessage(
  result: Pick<MatchmakingResult, 'is_bot_battle' | 'converted_from_queue'>,
  mode: BattleMode,
): string {
  const gotBot = Boolean(result.is_bot_battle || result.converted_from_queue);
  if (gotBot && mode !== 'bot') {
    return "No one was free — you're facing a practice bot instead.";
  }
  if (gotBot) return 'Your practice bot is ready.';
  return 'Opponent found.';
}

export const SEARCHING_MESSAGE = 'Finding an opponent…';

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

export interface WaitingHeroInput {
  hasOpponent: boolean;
  myLocked: boolean;
  opponentLocked: boolean;
  isResolving: boolean;
}

export interface WaitingHeroCopy {
  title: string;
  subtitle: string;
}

/**
 * The headline for whatever the player is actually waiting on.
 *
 * Three distinct waits used to share one "Entering the Arena" title: still in
 * the queue, locked and waiting for the other player, and both locked with
 * the judge working. The player could not tell which, so they could not tell
 * whether leaving the screen was safe.
 */
export function waitingHero(input: WaitingHeroInput): WaitingHeroCopy {
  if (!input.hasOpponent) {
    return {
      title: 'Finding an opponent…',
      subtitle:
        "Usually under a minute. We'll bring in a practice bot if no one's free.",
    };
  }
  if (input.isResolving || (input.myLocked && input.opponentLocked)) {
    return {
      title: 'The judge deliberates',
      subtitle: 'Weighing every word of both prompts…',
    };
  }
  if (input.myLocked) {
    return {
      title: 'Locked in',
      subtitle: 'Waiting for your opponent to lock in…',
    };
  }
  // Matched but not yet locked: the routing effect sends this player to the
  // face-off within a render, so this is a one-frame placeholder.
  return { title: 'Entering the arena', subtitle: 'One moment…' };
}

/**
 * A server message made fit to display.
 *
 * The matchmaking function writes "(43s remaining)" into its queue message.
 * That number was true when the response was built and is frozen on screen
 * for as long as the player looks at it; it comes off. Three dots become the
 * ellipsis character the rest of the flow uses.
 */
export function sanitizeServerMessage(
  message: string | null | undefined,
): string | null {
  if (!message) return null;
  const cleaned = message
    .replace(/\s*\(\s*~?\d+\s*(?:s|sec|secs|seconds)\s+remaining\s*\)/gi, '')
    .replace(/\.{3}/g, '…')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** "Opponent has 5m 03s to lock in", or that their time is up. */
export function opponentDeadlineLine(remainingMs: number): string {
  if (remainingMs <= 0) return "Opponent's time is up";
  return `Opponent has ${formatRemaining(remainingMs)} to lock in`;
}

/**
 * The `?round=` param as a round number, or `fallback` when it is missing or
 * not a positive integer -- `Number('abc')` is NaN, and a NaN round matched no
 * prompts and no round row, so the screen showed nothing locked forever.
 */
export function resolveRoundParam(
  raw: string | string[] | null | undefined,
  fallback: number,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const STILL_SCORING = 'Still scoring — this can take a minute.';
export const RECONNECTING = 'Reconnecting…';
export const ARENA_PREPARING = 'Getting the arena ready…';
export const NOTIFY_ON = "You'll be notified when the result is ready";
export const NOTIFY_OFF = "Turn on notifications to hear when it's ready";
export const BOT_READY = 'Bot is ready';
