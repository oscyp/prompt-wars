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
  buildUserPrompt,
  SUGGESTION_BODY_MAX,
  SUGGESTION_BODY_MIN,
  SUGGESTION_COUNT,
  SuggestionError,
  validateSuggestions,
} from '../_shared/move-suggestions.ts';

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
    moveType: 'finisher',
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
