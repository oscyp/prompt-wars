// Tests for the shared insufficient-credits translation.
//
// The client's shop CTA needs one number -- how many more credits -- and the
// only place it exists is inside the text of a Postgres RAISE. These tests pin
// the parse to that exact text and pin the 402 body to fields the app can read
// without touching `message`.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  insufficientCreditsResponse,
  isInsufficientCreditsError,
  parseInsufficientCredits,
} from '../_shared/credits.ts';

// Verbatim from spend_credits (20260506120000_database_functions.sql:492).
const RAISE_TEXT = 'Insufficient credits: 1 available, 3 required';

Deno.test(
  'credits - parses balance, price and shortfall from the RAISE text',
  () => {
    assertEquals(parseInsufficientCredits(RAISE_TEXT), {
      balance: 1,
      price: 3,
      shortfall: 2,
    });
  },
);

Deno.test(
  'credits - zero balance parses to a shortfall equal to the price',
  () => {
    assertEquals(
      parseInsufficientCredits('Insufficient credits: 0 available, 5 required'),
      {
        balance: 0,
        price: 5,
        shortfall: 5,
      },
    );
  },
);

Deno.test('credits - shortfall never goes negative', () => {
  // Cannot happen from spend_credits, but a caller must never be told to buy
  // a negative number of credits.
  assertEquals(
    parseInsufficientCredits('Insufficient credits: 9 available, 3 required')
      ?.shortfall,
    0,
  );
});

Deno.test('credits - anything but the exact message parses to null', () => {
  assertEquals(parseInsufficientCredits('Insufficient credits'), null);
  assertEquals(parseInsufficientCredits('wallet not found'), null);
  assertEquals(parseInsufficientCredits(''), null);
  assertEquals(parseInsufficientCredits(null), null);
  assertEquals(parseInsufficientCredits(undefined), null);
});

Deno.test('credits - detection is looser than parsing', () => {
  // A truncated or reworded refusal is still a 402, just without numbers.
  assertEquals(isInsufficientCreditsError('Insufficient credits'), true);
  assertEquals(
    isInsufficientCreditsError('INSUFFICIENT CREDITS: 1 available, 3 required'),
    true,
  );
  assertEquals(isInsufficientCreditsError('wallet not found'), false);
  assertEquals(isInsufficientCreditsError(null), false);
  assertEquals(isInsufficientCreditsError(undefined), false);
});

Deno.test(
  'credits - 402 body carries shortfall, balance and price',
  async () => {
    const res = insufficientCreditsResponse(RAISE_TEXT, 3);
    assertEquals(res.status, 402);
    assertEquals(res.headers.get('Content-Type'), 'application/json');
    const body = await res.json();
    assertEquals(body, {
      ok: false,
      error: {
        code: 'insufficient_credits',
        message: RAISE_TEXT,
        balance: 1,
        price: 3,
        shortfall: 2,
      },
    });
  },
);

Deno.test(
  'credits - the caller-supplied price wins over the parsed one',
  () => {
    // They are equal by construction; the typed value is the one we trust.
    const res = insufficientCreditsResponse(
      'Insufficient credits: 1 available, 3 required',
      4,
    );
    return res.json().then((body) => {
      assertEquals(body.error.price, 4);
      assertEquals(body.error.balance, 1);
      assertEquals(body.error.shortfall, 3);
    });
  },
);

Deno.test(
  'credits - price falls back to the parsed value when the caller has none',
  async () => {
    const body = await insufficientCreditsResponse(RAISE_TEXT).json();
    assertEquals(body.error.price, 3);
    assertEquals(body.error.shortfall, 2);
  },
);

Deno.test(
  'credits - unparseable message yields null numbers, not missing keys',
  async () => {
    // `null` tells the client "unknown"; a missing key would read as "old server".
    const body = await insufficientCreditsResponse(
      'Insufficient credits',
      3,
    ).json();
    assertEquals(body.error.code, 'insufficient_credits');
    assertEquals(body.error.price, 3);
    assertEquals(body.error.balance, null);
    assertEquals(body.error.shortfall, null);
  },
);

Deno.test(
  'credits - caller extras are merged flat into the same error object',
  async () => {
    // generate-portrait's free-render counters ride along with the shortfall.
    const body = await insufficientCreditsResponse(RAISE_TEXT, 3, {
      free_renders_used: 3,
      free_renders_total: 3,
    }).json();
    assertEquals(body.error.free_renders_used, 3);
    assertEquals(body.error.free_renders_total, 3);
    assertEquals(body.error.shortfall, 2);
  },
);

Deno.test(
  'credits - extras cannot overwrite the structured fields',
  async () => {
    const body = await insufficientCreditsResponse(RAISE_TEXT, 3, {
      shortfall: 99,
    }).json();
    assertEquals(body.error.shortfall, 2);
  },
);
