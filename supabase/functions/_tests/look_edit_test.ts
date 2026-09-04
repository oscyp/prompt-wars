// Tests for the batched `look` character edit.
//
// Everything here is free, so the stakes are different from the identity batch:
// the thing worth protecting is that a no-op is dropped rather than written.
// A spurious write bumps appearance_version, which tells the player their
// portrait is out of date and invites them to spend 3 credits redrawing a
// character that did not change.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  planLookBatch,
  validateLookField,
  randomLookTraits,
  LOOK_FIELDS,
  PROMPT_MAX,
} from '../_shared/look-edit.ts';

const character = {
  art_style: 'painterly',
  portrait_prompt_raw: null,
  palette_key: 'ember',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  era: 'modern',
  expression: 'calm',
  signature_item_id: '11111111-1111-1111-1111-111111111111',
};

Deno.test('look - rejects an empty payload', () => {
  assertEquals(planLookBatch(character, {}).ok, false);
});

Deno.test('look - applies every trait in one batch', () => {
  const plan = planLookBatch(character, {
    vibe: 'sinister',
    silhouette: 'heavy_bruiser',
    era: 'cyberpunk',
    expression: 'roar',
    palette_key: 'neon',
    art_style: 'comic',
  });
  assert(plan.ok);
  assertEquals(plan.changed.length, 6);
});

Deno.test('look - drops a field staged back to its saved value', () => {
  const plan = planLookBatch(character, { vibe: 'heroic', era: 'cyberpunk' });
  assert(plan.ok);
  assertEquals(
    plan.changed.map((c) => c.field),
    ['era'],
  );
});

Deno.test('look - a no-op batch changes nothing', () => {
  // Would otherwise bump appearance_version and falsely mark the portrait stale.
  const plan = planLookBatch(character, {
    vibe: 'heroic',
    palette_key: 'ember',
  });
  assert(plan.ok);
  assertEquals(plan.changed.length, 0);
  assertEquals(Object.keys(plan.update).length, 0);
});

Deno.test(
  'look - validates everything before reporting any of it applicable',
  () => {
    const plan = planLookBatch(character, {
      era: 'cyberpunk',
      vibe: 'confused',
    });
    assertEquals(plan.ok, false);
    if (!plan.ok) assertEquals(plan.field, 'vibe');
  },
);

Deno.test(
  'look - clearing the prompt is a real change, not an absent field',
  () => {
    // Switching from "your own words" back to Guided is exactly this write, and
    // the resolver reads the traits again the moment the prompt is empty.
    const withPrompt = {
      ...character,
      portrait_prompt_raw: 'a knight of glass',
    };
    const plan = planLookBatch(withPrompt, { portrait_prompt_raw: null });
    assert(plan.ok);
    assertEquals(plan.changed.length, 1);
    assertEquals(plan.update.portrait_prompt_raw, null);
  },
);

Deno.test('look - blank and whitespace prompts normalise to null', () => {
  assertEquals(validateLookField('portrait_prompt_raw', ''), { value: null });
  assertEquals(validateLookField('portrait_prompt_raw', '   '), {
    value: null,
  });
  assertEquals(validateLookField('portrait_prompt_raw', null), { value: null });
});

Deno.test('look - clearing an already-empty prompt is not a change', () => {
  const plan = planLookBatch(character, { portrait_prompt_raw: '' });
  assert(plan.ok);
  assertEquals(plan.changed.length, 0);
});

Deno.test('look - rejects an over-long prompt', () => {
  assert(
    'reason' in
      validateLookField('portrait_prompt_raw', 'x'.repeat(PROMPT_MAX + 1)),
  );
  assert(
    'value' in validateLookField('portrait_prompt_raw', 'x'.repeat(PROMPT_MAX)),
  );
});

Deno.test('look - the item is never null', () => {
  // characters.signature_item_id is NOT NULL; unequipping is not a state.
  assert('reason' in validateLookField('signature_item_id', null));
  assert('reason' in validateLookField('signature_item_id', ''));
  assert(
    'value' in
      validateLookField(
        'signature_item_id',
        '11111111-1111-1111-1111-111111111112',
      ),
  );
});

Deno.test(
  'look - traits and art style share one audit kind, palette and item keep theirs',
  () => {
    const kindOf = (f: string) =>
      LOOK_FIELDS.find((d) => d.field === f)?.logKind;
    assertEquals(kindOf('vibe'), 'traits');
    assertEquals(kindOf('art_style'), 'traits');
    assertEquals(kindOf('portrait_prompt_raw'), 'traits');
    assertEquals(kindOf('palette_key'), 'palette');
    assertEquals(kindOf('signature_item_id'), 'signature_item');
  },
);

Deno.test(
  'look - every log kind is one the character_edits CHECK allows',
  () => {
    const allowed = new Set(['traits', 'palette', 'signature_item']);
    for (const f of LOOK_FIELDS) assert(allowed.has(f.logKind), f.logKind);
  },
);

Deno.test('random - shuffles all five traits into valid values', () => {
  for (let i = 0; i < 40; i++) {
    const t = randomLookTraits();
    const plan = planLookBatch(character, t);
    // Every generated value must survive validation, or the paid random
    // character action fails after the player has been charged.
    assert(plan.ok, JSON.stringify(t));
    assertEquals(Object.keys(t).sort(), [
      'era',
      'expression',
      'palette_key',
      'silhouette',
      'vibe',
    ]);
  }
});
