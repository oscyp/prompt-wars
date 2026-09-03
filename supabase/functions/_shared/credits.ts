// Shared handling for the one refusal every paid Edge Function has to translate.
//
// `spend_credits` refuses with
//
//   RAISE EXCEPTION 'Insufficient credits: % available, % required'
//   (supabase/migrations/20260506120000_database_functions.sql:492)
//
// Five functions matched that prose with a regex and returned a bare 402, so
// the client knew the player was short but not by how much -- and "by how much"
// is the one number the shop CTA needs ("You need 2 more credits"). The
// structured fields here follow the rule in character-creation.ts: `code` is
// the contract, extras are numbers, and the app never parses `message`.

import { err } from './character-creation.ts';

export interface InsufficientCredits {
  /** Credits the player had when the charge was refused. */
  balance: number;
  /** Credits the charge asked for. */
  price: number;
  /** `max(price - balance, 0)`: how many more credits would have made it go through. */
  shortfall: number;
}

const INSUFFICIENT_CREDITS_PATTERN =
  /Insufficient credits:\s*(-?\d+)\s+available,\s*(-?\d+)\s+required/i;

/** True for any `spend_credits` insufficient-balance refusal, parseable or not. */
export function isInsufficientCreditsError(
  message: string | null | undefined,
): boolean {
  return /Insufficient credits/i.test(message ?? '');
}

/**
 * Pulls balance and price out of the RAISE text. Returns null for anything
 * that is not that exact message, including a truncated or reworded one, so
 * callers never act on a guessed number.
 */
export function parseInsufficientCredits(
  message: string | null | undefined,
): InsufficientCredits | null {
  const match = INSUFFICIENT_CREDITS_PATTERN.exec(message ?? '');
  if (!match) return null;
  const balance = Number(match[1]);
  const price = Number(match[2]);
  if (!Number.isFinite(balance) || !Number.isFinite(price)) return null;
  return { balance, price, shortfall: Math.max(price - balance, 0) };
}

/**
 * The 402 every paid function returns.
 *
 * `price` is what the caller tried to charge and wins over the parsed figure
 * (they are the same value by construction -- the RAISE echoes p_amount -- but
 * the caller's copy is typed). `extra` is merged into the same error object so
 * a function with its own context (generate-portrait's free-render counters)
 * keeps one flat body rather than nesting.
 *
 * Fields that cannot be determined are `null`, never omitted, so the client can
 * distinguish "unknown" from "not sent by this server version".
 */
export function insufficientCreditsResponse(
  message: string | null | undefined,
  price?: number | null,
  extra?: Record<string, unknown>,
): Response {
  const parsed = parseInsufficientCredits(message);
  const resolvedPrice = price ?? parsed?.price ?? null;
  const balance = parsed?.balance ?? null;
  const shortfall =
    resolvedPrice !== null && balance !== null
      ? Math.max(resolvedPrice - balance, 0)
      : null;
  return err('insufficient_credits', message ?? 'Insufficient credits', 402, {
    ...extra,
    balance,
    price: resolvedPrice,
    shortfall,
  });
}
