// Tests for the batched `identity` character edit.
//
// Covers the planning half: which fields count as changes, what is rejected,
// and -- most importantly -- what is silently dropped. Every field here carries
// a cooldown of a day or more, so treating a non-edit as an edit locks a player
// out of their own name for a week.

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  planIdentityBatch,
  validateIdentityField,
  IDENTITY_FIELDS,
} from '../_shared/identity-edit.ts';

const character = {
  name: 'AndrewGolota',
  archetype: 'strategist',
  battle_cry: 'Come and take it',
  signature_color: '#3b82f6',
};

Deno.test('identity - rejects an empty payload', () => {
  const plan = planIdentityBatch(character, {});
  assertEquals(plan.ok, false);
});

Deno.test('identity - accepts a partial payload', () => {
  const plan = planIdentityBatch(character, { name: 'Golota' });
  assert(plan.ok);
  assertEquals(plan.changed.length, 1);
  assertEquals(plan.update, { name: 'Golota' });
});

Deno.test('identity - applies every present field at once', () => {
  const plan = planIdentityBatch(character, {
    name: 'Golota',
    archetype: 'titan',
    battle_cry: 'Again',
    signature_color: '#FF0000',
  });
  assert(plan.ok);
  assertEquals(plan.changed.length, 4);
});

Deno.test('identity - drops a field staged back to its saved value', () => {
  // Not an edit. Applying it would start the 7-day rename cooldown for nothing.
  const plan = planIdentityBatch(character, {
    name: 'AndrewGolota',
    battle_cry: 'Again',
  });
  assert(plan.ok);
  assertEquals(
    plan.changed.map((c) => c.field),
    ['battle_cry'],
  );
});

Deno.test(
  'identity - trims before comparing, so whitespace is not an edit',
  () => {
    const plan = planIdentityBatch(character, { name: '  AndrewGolota  ' });
    assert(plan.ok);
    assertEquals(plan.changed.length, 0);
  },
);

Deno.test(
  'identity - validates before reporting anything as applicable',
  () => {
    // The valid field must not slip through alongside the invalid one.
    const plan = planIdentityBatch(character, {
      battle_cry: 'Again',
      archetype: 'wizard',
    });
    assertEquals(plan.ok, false);
    if (!plan.ok) assertEquals(plan.field, 'archetype');
  },
);

Deno.test('identity - rejects an over-long name and battle cry', () => {
  assert('reason' in validateIdentityField('name', 'x'.repeat(41)));
  assert('reason' in validateIdentityField('battle_cry', 'x'.repeat(61)));
  assert('value' in validateIdentityField('name', 'x'.repeat(40)));
  assert('value' in validateIdentityField('battle_cry', 'x'.repeat(60)));
});

Deno.test('identity - rejects a non-hex signature colour', () => {
  assert('reason' in validateIdentityField('signature_color', 'red'));
  assert('reason' in validateIdentityField('signature_color', '#FFF'));
  assert('value' in validateIdentityField('signature_color', '#a1b2c3'));
});

Deno.test('identity - each field logs under its own cooldown kind', () => {
  // Cooldowns are looked up by character_edits.edit_kind. If two fields shared
  // a log kind, editing one would silently lock the other.
  const kinds = IDENTITY_FIELDS.map((f) => f.logKind);
  assertEquals(new Set(kinds).size, kinds.length);
  assertEquals(kinds, ['name', 'archetype', 'battle_cry', 'signature_color']);
});

Deno.test('identity - rename is priced as `rename`, not `name`', () => {
  // The price table and the audit log use different vocabularies for this one.
  const rename = IDENTITY_FIELDS.find((f) => f.field === 'name')!;
  assertEquals(rename.priceKey, 'rename');
  assertEquals(rename.logKind, 'name');
});
