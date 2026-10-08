// Tests for the move-suggestion prompt builder and response validator.
//
// The validator is the interesting half: the provider's strict json_schema is
// a promise, not a guarantee we control, and a body outside 20-800 characters
// would be rejected by the move_prompt_suggestions CHECK at insert time --
// surfacing to the player as an opaque server error after they were charged.

import {
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  buildFighterBrief,
  buildSuggestionSchema,
  buildSystemPrompt,
  buildUserPrompt,
  SUGGESTION_BODY_MAX,
  SUGGESTION_BODY_MIN,
  SUGGESTION_BODY_TARGET_MAX,
  SUGGESTION_COUNT,
  SuggestionError,
  validateCombinedSuggestions,
  validateSuggestions,
} from '../_shared/move-suggestions.ts';
import type { MoveType } from '../_shared/move-suggestions.ts';

const FIGHTER = {
  name: 'Ashvane',
  archetype: 'mystic',
  vibe: 'stoic',
  silhouette: 'robed_mystic',
  era: 'ancient',
  expression: 'calm',
  paletteKey: 'ember',
  battleCry: 'The ash remembers.',
  styleDescription: 'Slow, deliberate, never the first to move.',
  signatureItemName: 'Cinder Censer',
  signatureItemFragment: 'a hanging brass censer trailing live embers',
};

function validSet(count = SUGGESTION_COUNT) {
  return {
    suggestions: Array.from({ length: count }, (_, i) => ({
      title: `Move ${i}`,
      body: 'x'.repeat(SUGGESTION_BODY_MIN + 10),
    })),
  };
}

Deno.test('buildFighterBrief includes every populated fighter field', () => {
  const brief = buildFighterBrief(FIGHTER);

  assertStringIncludes(brief, 'Ashvane');
  assertStringIncludes(brief, 'mystic');
  assertStringIncludes(brief, 'robed_mystic');
  assertStringIncludes(brief, 'The ash remembers.');
  // The signature item's prompt_fragment is purpose-written prose and must
  // reach the model verbatim rather than being summarised away.
  assertStringIncludes(brief, 'a hanging brass censer trailing live embers');
});

Deno.test('buildFighterBrief omits absent optional fields cleanly', () => {
  const brief = buildFighterBrief({ name: 'Nul', archetype: 'titan' });

  assertStringIncludes(brief, 'Nul');
  assertEquals(brief.includes('undefined'), false);
  assertEquals(brief.includes('null'), false);
  assertEquals(brief.includes('Signature item'), false);
});

Deno.test('buildUserPrompt carries theme, round and move guidance', () => {
  const prompt = buildUserPrompt({
    fighter: FIGHTER,
    moveTypes: ['finisher'],
    theme: 'A collapsing observatory',
    roundNumber: 3,
    seed: 1,
  });

  assertStringIncludes(prompt, 'A collapsing observatory');
  assertStringIncludes(prompt, 'Round: 3');
  assertStringIncludes(prompt, 'finisher');
  assertStringIncludes(prompt, 'decisive closing move');
});

Deno.test('validateSuggestions accepts a well-formed set', () => {
  const out = validateSuggestions(validSet());
  assertEquals(out.length, SUGGESTION_COUNT);
  assertEquals(out[0].title, 'Move 0');
});

Deno.test('validateSuggestions rejects the wrong count', () => {
  assertThrows(
    () => validateSuggestions(validSet(2)),
    SuggestionError,
    'expected 3 suggestions',
  );
});

Deno.test('validateSuggestions rejects a non-array payload', () => {
  assertThrows(
    () => validateSuggestions({ suggestions: 'nope' }),
    SuggestionError,
  );
  assertThrows(() => validateSuggestions({}), SuggestionError);
  assertThrows(() => validateSuggestions(null), SuggestionError);
});

Deno.test('validateSuggestions rejects a body under the table minimum', () => {
  const set = validSet();
  set.suggestions[1].body = 'too short';
  assertThrows(
    () => validateSuggestions(set),
    SuggestionError,
    'outside 20-800',
  );
});

Deno.test('validateSuggestions rejects a body over the table maximum', () => {
  const set = validSet();
  set.suggestions[0].body = 'x'.repeat(SUGGESTION_BODY_MAX + 1);
  assertThrows(() => validateSuggestions(set), SuggestionError);
});

Deno.test('validateSuggestions rejects a missing title', () => {
  const set = validSet();
  set.suggestions[2].title = '   ';
  assertThrows(() => validateSuggestions(set), SuggestionError, 'no title');
});

Deno.test('validateSuggestions trims and truncates the title', () => {
  const set = validSet();
  set.suggestions[0].title = `  ${'t'.repeat(80)}  `;
  const out = validateSuggestions(set);
  assertEquals(out[0].title.length, 48);
});

Deno.test(
  'validateSuggestions counts a whitespace-padded body after trimming',
  () => {
    // A body of 19 real characters padded to 25 must still be rejected: the
    // trimmed value is what gets persisted and checked.
    const set = validSet();
    set.suggestions[0].body = `   ${'x'.repeat(19)}   `;
    assertThrows(
      () => validateSuggestions(set),
      SuggestionError,
      'outside 20-800',
    );
  },
);


// --- The target/max asymmetry ----------------------------------------------
//
// SUGGESTION_BODY_TARGET_MAX is what we ask the model for; SUGGESTION_BODY_MAX
// is what the table's CHECK allows. They are deliberately different, and
// collapsing them into one constant would either re-lengthen every generation
// or start rejecting storable sets. These tests exist to make that tidy-up
// fail loudly.

Deno.test('the generation target sits below the storable maximum', () => {
  assertEquals(SUGGESTION_BODY_TARGET_MAX < SUGGESTION_BODY_MAX, true);
  assertEquals(SUGGESTION_BODY_TARGET_MAX > SUGGESTION_BODY_MIN, true);
});

Deno.test(
  'validateSuggestions accepts a body between the target and the maximum',
  () => {
    // A model that overshoots the requested length must NOT cost the player
    // the call: rejecting the set releases the free slot and buys nothing.
    const set = validSet();
    set.suggestions[0].body = 'x'.repeat(SUGGESTION_BODY_TARGET_MAX + 50);
    const out = validateSuggestions(set);
    assertEquals(out[0].body.length, SUGGESTION_BODY_TARGET_MAX + 50);
  },
);

Deno.test('validateSuggestions still rejects a body past the table bound', () => {
  const set = validSet();
  set.suggestions[0].body = 'x'.repeat(SUGGESTION_BODY_MAX + 1);
  assertThrows(() => validateSuggestions(set), SuggestionError, 'outside');
});

Deno.test('the system prompt asks for the target length, not the table bound', () => {
  const prompt = buildSystemPrompt();
  assertStringIncludes(
    prompt,
    `- body: ${SUGGESTION_BODY_MIN}-${SUGGESTION_BODY_TARGET_MAX} characters.`,
  );
});


// --- one call covering several move types -----------------------------------

const ALL_MOVES: MoveType[] = ['attack', 'defense', 'finisher'];

Deno.test('the combined prompt carries guidance for every move type', () => {
  const prompt = buildUserPrompt({
    fighter: FIGHTER,
    moveTypes: ALL_MOVES,
    theme: 'A collapsing observatory',
    roundNumber: 2,
    seed: 1,
  });

  assertStringIncludes(prompt, 'Move type: attack');
  assertStringIncludes(prompt, 'Move type: defense');
  assertStringIncludes(prompt, 'Move type: finisher');
  assertStringIncludes(prompt, 'decisive closing move');
  assertStringIncludes(prompt, 'absorb, redirect or punish');
});

Deno.test('the combined prompt sends the fighter brief exactly once', () => {
  // The brief is the bulk of the input. Sending it once is why three move
  // types in one call cost far less than three separate calls would.
  const prompt = buildUserPrompt({
    fighter: FIGHTER,
    moveTypes: ALL_MOVES,
    theme: 'A collapsing observatory',
    roundNumber: 2,
    seed: 1,
  });
  const occurrences = prompt.split('a hanging brass censer trailing live embers')
    .length - 1;
  assertEquals(occurrences, 1);
});

/** Walks every object in a JSON schema, not just the root. */
function eachSchemaObject(
  node: unknown,
  visit: (o: Record<string, unknown>) => void,
): void {
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (o.type === 'object') visit(o);
  for (const value of Object.values(o)) {
    if (Array.isArray(value)) value.forEach((v) => eachSchemaObject(v, visit));
    else eachSchemaObject(value, visit);
  }
}

Deno.test('every object in the schema is strict, at every depth', () => {
  // xAI strict mode needs `required` AND `additionalProperties: false` on each
  // object. Nesting a second level to key by move type is a fresh chance to
  // miss one, and a spot check of the root would not catch it -- so walk.
  const schema = buildSuggestionSchema(ALL_MOVES);
  let checked = 0;
  eachSchemaObject(schema, (o) => {
    checked++;
    assertEquals(o.additionalProperties, false);
    assertEquals(
      Array.isArray(o.required) && (o.required as unknown[]).length > 0,
      true,
    );
  });
  // root + 3 move branches + the shared item schema
  assertEquals(checked >= 5, true);
});

Deno.test('the schema requires every move type asked for, and no others', () => {
  const schema = buildSuggestionSchema(['attack', 'defense']);
  assertEquals(schema.required, ['attack', 'defense']);
  assertEquals(Object.keys(schema.properties), ['attack', 'defense']);
});

Deno.test('validateCombinedSuggestions returns a set per move type', () => {
  const parsed = {
    attack: validSet(),
    defense: validSet(),
    finisher: validSet(),
  };
  const out = validateCombinedSuggestions(parsed, ALL_MOVES);
  assertEquals(Object.keys(out).sort(), ['attack', 'defense', 'finisher']);
  assertEquals(out.attack.length, SUGGESTION_COUNT);
});

Deno.test('validateCombinedSuggestions rejects a missing move type', () => {
  // A missing branch is a hard failure, not an empty slot: the caller has
  // already CLAIMED a row for that move type, and silently returning nothing
  // would strand the claim.
  const parsed = { attack: validSet(), defense: validSet() };
  assertThrows(
    () => validateCombinedSuggestions(parsed, ALL_MOVES),
    SuggestionError,
    'missing the finisher branch',
  );
});

Deno.test('a single-move request uses the very same shape', () => {
  // One code path for 1 and for 3. Two would drift on moderation, cost
  // attribution and error mapping -- and the single path is the PAID one.
  const out = validateCombinedSuggestions({ attack: validSet() }, ['attack']);
  assertEquals(out.attack.length, SUGGESTION_COUNT);
});
