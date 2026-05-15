// Deno tests for the portrait prompt resolver.
// Run with: deno test supabase/functions/_tests/portrait-prompt-resolver.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolvePortraitPrompt,
  resolveItemIconPrompt,
  describeSignatureColor,
  __internal,
} from '../_shared/portrait-prompt-resolver.ts';

Deno.test('resolver includes raw subject when prompt_raw is provided', () => {
  const out = resolvePortraitPrompt({
    prompt_raw: 'an undead pirate captain with a brass spyglass',
    archetype: 'trickster',
    signature_color: '#A12FCC',
    seed: 42,
  });
  assert(out.includes('undead pirate captain'), `missing raw subject: ${out}`);
  assert(out.includes('brass spyglass'), `missing raw subject detail: ${out}`);
});

Deno.test('resolver composes from each trait phrase when no prompt_raw', () => {
  const out = resolvePortraitPrompt({
    traits: {
      vibe: 'sinister',
      silhouette: 'knight',
      palette: 'ember',
      era: 'industrial',
      expression: 'glare',
    },
    archetype: 'titan',
    signature_color: '#FF3300',
    seed: 7,
  });
  assert(out.includes('sinister grin'), `missing vibe phrase: ${out}`);
  assert(out.includes('armored knight stance'), `missing silhouette phrase: ${out}`);
  assert(out.includes('ember reds and oranges'), `missing palette phrase: ${out}`);
  assert(out.includes('industrial steam-era setting'), `missing era phrase: ${out}`);
  assert(out.includes('fierce glare'), `missing expression phrase: ${out}`);
});

Deno.test('resolver always appends negative-prompt clauses', () => {
  const minimal = resolvePortraitPrompt({
    archetype: 'mystic',
    signature_color: '#112233',
    seed: 1,
  });
  assert(minimal.includes('No real people'), 'missing real-people negative');
  assert(minimal.includes('No nudity'), 'missing nudity negative');
  assert(minimal.includes('No brand logos'), 'missing logos negative');
  assert(
    minimal.includes('No text') || minimal.includes('watermark'),
    'missing text/watermark negative',
  );

  const withRaw = resolvePortraitPrompt({
    prompt_raw: 'a chrome-plated wanderer',
    archetype: 'engineer',
    signature_color: '#888888',
    seed: 2,
  });
  assert(withRaw.includes('No real people'));
  assert(withRaw.includes('watermark'));
});

Deno.test('resolver caps output at 800 chars even with maximal input', () => {
  const huge = 'x '.repeat(2000);
  const out = resolvePortraitPrompt({
    prompt_raw: huge,
    traits: {
      vibe: 'unhinged',
      silhouette: 'bruiser',
      palette: 'neon',
      era: 'cyberpunk',
      expression: 'roar',
    },
    archetype: 'titan',
    signature_color: '#7733FF',
    signature_item_fragment: 'wielding a brass fountain pen the size of a sword '.repeat(20),
    seed: 999,
  });
  assert(
    out.length <= __internal.MAX_PROMPT_CHARS,
    `expected ≤${__internal.MAX_PROMPT_CHARS} chars, got ${out.length}`,
  );
});

Deno.test('seed appears in output and color appears as descriptor (not raw hex)', () => {
  const out = resolvePortraitPrompt({
    prompt_raw: 'a stoic samurai',
    archetype: 'strategist',
    signature_color: '#A12FCC',
    seed: 12345,
  });
  assert(out.includes('12345'), `seed missing from output: ${out}`);
  assert(!out.includes('#A12FCC'), `raw hex leaked into prompt: ${out}`);
  assert(!out.toLowerCase().includes('a12fcc'), `raw hex value leaked into prompt: ${out}`);
  // Should contain a color descriptor word.
  const lower = out.toLowerCase();
  assert(
    lower.includes('purple') ||
      lower.includes('magenta') ||
      lower.includes('pink') ||
      lower.includes('signature accent'),
    `color descriptor missing: ${out}`,
  );
});

Deno.test('describeSignatureColor buckets hues into named families', () => {
  assertEquals(describeSignatureColor('#000000'), 'a near-black signature accent');
  assertEquals(describeSignatureColor('#FFFFFF'), 'a near-white signature accent');
  assert(describeSignatureColor('#FF0000').includes('crimson red'));
  assert(describeSignatureColor('#00B5FF').includes('cyan') || describeSignatureColor('#00B5FF').includes('blue'));
  assertEquals(describeSignatureColor('not-a-hex'), 'a distinctive signature color');
});

Deno.test('item icon resolver produces icon-styled prompt with negatives and seed', () => {
  const out = resolveItemIconPrompt({
    name: 'Brass Fountain Pen',
    description: 'an oversized pen with sharpened nib',
    item_class: 'weaponized_mundane',
    seed: 555,
  });
  assert(out.toLowerCase().includes('icon'), `missing icon style cue: ${out}`);
  assert(out.includes('Brass Fountain Pen'), `missing item name: ${out}`);
  assert(out.includes('555'), `missing seed: ${out}`);
  assert(out.includes('No real people'), 'missing negatives');
  assert(out.length <= __internal.MAX_PROMPT_CHARS);
});

Deno.test('signature_item_fragment is included in portrait prompt', () => {
  const out = resolvePortraitPrompt({
    archetype: 'engineer',
    signature_color: '#33AA66',
    signature_item_fragment: 'wielding a brass fountain pen',
    seed: 11,
  });
  assert(out.includes('brass fountain pen'), `signature item missing: ${out}`);
});

Deno.test('art_style swaps the scaffold and keyword for each known style', () => {
  const cases: Array<[Parameters<typeof resolvePortraitPrompt>[0]['art_style'], string]> = [
    ['painterly', 'painterly'],
    ['anime', 'cel-shaded anime'],
    ['comic', 'comic-book'],
    ['pixel', 'pixel-art'],
    ['oil', 'oil-painting'],
    ['lowpoly', 'low-poly'],
    ['darkfantasy', 'dark-fantasy'],
    ['vaporwave', 'synthwave'],
  ];
  for (const [style, keyword] of cases) {
    const out = resolvePortraitPrompt({
      archetype: 'strategist',
      signature_color: '#A12FCC',
      seed: 1,
      art_style: style,
    });
    assert(
      out.toLowerCase().includes(keyword),
      `style ${style} should include '${keyword}': ${out}`,
    );
    assert(out.length <= __internal.MAX_PROMPT_CHARS, `style ${style} exceeded cap`);
  }
});

Deno.test('art_style defaults to painterly when omitted or unknown', () => {
  const omitted = resolvePortraitPrompt({
    archetype: 'mystic',
    signature_color: '#112233',
    seed: 1,
  });
  assert(omitted.toLowerCase().includes('painterly'), 'omitted art_style should default to painterly');

  const unknown = resolvePortraitPrompt({
    archetype: 'mystic',
    signature_color: '#112233',
    seed: 1,
    // deno-lint-ignore no-explicit-any
    art_style: 'bogus' as any,
  });
  assert(unknown.toLowerCase().includes('painterly'), 'unknown art_style should default to painterly');
});
