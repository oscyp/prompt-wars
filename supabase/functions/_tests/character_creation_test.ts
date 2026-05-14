// Tests for character-creation shared helpers.
// Pure helpers only; Edge Function HTTP behavior is covered by integration tests.

import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { randomPortraitSeed } from '../_shared/character-creation.ts';

Deno.test('randomPortraitSeed returns a 32-bit unsigned integer', () => {
  const seed = randomPortraitSeed();
  assertEquals(typeof seed, 'number');
  assertEquals(seed >= 0, true);
  assertEquals(seed <= 0xffffffff, true);
});

Deno.test('randomPortraitSeed produces distinct values across calls', () => {
  const a = randomPortraitSeed();
  const b = randomPortraitSeed();
  // Probabilistic but effectively certain for 32-bit space.
  assertNotEquals(a, b);
});
