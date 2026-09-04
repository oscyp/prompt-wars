// Cosmetics have to reach the OPPONENT, and must never reach the judge.
//
// Both halves are load-bearing. RLS on `characters` is `profile_id = auth.uid()`,
// so a cosmetic that does not travel in a server-composed payload is one only
// its owner can see -- which defeats the entire point of wearing it. And a
// cosmetic that reaches the judge would let money buy scoring, which the
// concept doc forbids outright.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { RENDERABLE_TYPES_FOR_TEST } from '../cosmetics/renderable-types.ts';

Deno.test('cosmetics - reveal_style is not sellable', () => {
  // It can be owned and equipped, but nothing renders it, so the purchase
  // action must refuse it. The shop shows "Coming soon" for the same reason.
  assertEquals(RENDERABLE_TYPES_FOR_TEST.includes('reveal_style'), false);
});

Deno.test('cosmetics - every other type is sellable', () => {
  for (const type of ['frame', 'title', 'badge', 'avatar_effect', 'color']) {
    assert(
      RENDERABLE_TYPES_FOR_TEST.includes(type),
      `${type} should be sellable`,
    );
  }
});

Deno.test('judge isolation - cosmetic fields are redacted', async () => {
  // Guards the redaction list, which lives in _shared/anti-p2w.ts since
  // leave-battle became a second consumer. If "cosmetic" ever drops out of it,
  // purchases start influencing scores, and that is a fairness bug rather than
  // a cosmetic one.
  const source = await Deno.readTextFile(
    new URL('../_shared/anti-p2w.ts', import.meta.url),
  );
  const bannedBlock = source.slice(
    source.indexOf('const banned = ['),
    source.indexOf(']', source.indexOf('const banned = [')),
  );
  assert(
    /['"]cosmetic['"]/.test(bannedBlock),
    'the guard must redact "cosmetic"',
  );
  assert(
    /['"]cosmetic_unlocks['"]/.test(bannedBlock),
    'the guard must redact "cosmetic_unlocks"',
  );
});

Deno.test('judge isolation - round-resolve still runs the guard', async () => {
  // Moving the list out of round-resolve made it possible to keep a perfectly
  // good ban list that nothing calls. This asserts the wiring, not the list.
  const source = await Deno.readTextFile(
    new URL('../round-resolve/index.ts', import.meta.url),
  );
  assert(
    /from\s+['"]\.\.\/_shared\/anti-p2w\.ts['"]/.test(source),
    'round-resolve must import the anti-pay-to-win guard',
  );
  assert(
    /assertNoMonetizationDataInScoring\s*\(\s*\{/.test(source),
    'round-resolve must call the guard on its scoring inputs',
  );
});

Deno.test(
  'judge isolation - no cosmetic field reaches the judge payload',
  async () => {
    // The judge builds from prompts, move types, theme and rubric only. A
    // `cosmetic` reference appearing in the payload construction would mean a
    // purchase is visible at scoring time.
    const source = await Deno.readTextFile(
      new URL('../_shared/judge.ts', import.meta.url),
    );
    assertEquals(
      /cosmetic/i.test(source),
      false,
      'judge.ts must not reference cosmetics at all',
    );
  },
);
