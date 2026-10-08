// Tier 1 video cost is CONFIGURED, not measured -- xAI's video endpoint
// returns no usage block. The important property is therefore what happens
// when it is NOT configured: an unpriced run must record NULL, because a NULL
// reads as "we do not know" (true) while a zero reads as "free" (not true,
// and it is the reading that has made the 100/day auto cap look costless).

import {
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

/** Rates are floats, so compare to the cent rather than to the bit. */
const assertUsd = (actual: number | undefined, expected: number) =>
  assertAlmostEquals(actual ?? NaN, expected, 1e-9);
import { configuredVideoCostUsd } from '../_shared/video-constants.ts';

const RATE = 'XAI_VIDEO_COST_USD_PER_SECOND';
const PER_MODEL = 'VIDEO_COST_USD_PER_SECOND__GROK_IMAGINE_VIDEO_1_5';

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map(
    Object.keys(env).map((k) => [k, Deno.env.get(k)] as const),
  );
  try {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    fn();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test('an unpriced run records nothing rather than zero', () => {
  withEnv({ [RATE]: undefined, [PER_MODEL]: undefined }, () => {
    assertEquals(configuredVideoCostUsd('grok-imagine-video', 8), undefined);
  });
});

Deno.test('the blanket rate prices by duration', () => {
  withEnv({ [RATE]: '0.05', [PER_MODEL]: undefined }, () => {
    assertUsd(configuredVideoCostUsd('grok-imagine-video', 8), 0.4);
    assertUsd(configuredVideoCostUsd('grok-imagine-video', 12), 0.6);
  });
});

Deno.test('a per-model rate wins over the blanket one', () => {
  // A reference-capable model is not priced like plain text-to-video, and the
  // worker picks between them at submission time.
  withEnv({ [RATE]: '0.05', [PER_MODEL]: '0.09' }, () => {
    assertUsd(configuredVideoCostUsd('grok-imagine-video-1.5', 8), 0.72);
    assertUsd(configuredVideoCostUsd('grok-imagine-video', 8), 0.4);
  });
});

Deno.test('a malformed or negative rate records nothing', () => {
  withEnv({ [RATE]: 'free!', [PER_MODEL]: undefined }, () => {
    assertEquals(configuredVideoCostUsd('grok-imagine-video', 8), undefined);
  });
  withEnv({ [RATE]: '-1', [PER_MODEL]: undefined }, () => {
    assertEquals(configuredVideoCostUsd('grok-imagine-video', 8), undefined);
  });
});

Deno.test('a missing duration records nothing', () => {
  withEnv({ [RATE]: '0.05', [PER_MODEL]: undefined }, () => {
    assertEquals(configuredVideoCostUsd('grok-imagine-video', 0), undefined);
    assertEquals(configuredVideoCostUsd('grok-imagine-video', null), undefined);
  });
});

Deno.test('an unknown model still gets the blanket rate', () => {
  withEnv({ [RATE]: '0.05', [PER_MODEL]: undefined }, () => {
    assertUsd(configuredVideoCostUsd('some-new-model', 8), 0.4);
  });
});
