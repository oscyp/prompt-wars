// Text moderation: fail-closed behaviour and word-boundary matching.
//
// Two defects this pins:
//   1. Provider errors were swallowed and fell through to a hardcoded
//      "approved", so an OpenAI outage silently reduced the whole UGC pipeline
//      -- prompts that reach a video generator -- to a twelve-word blocklist.
//   2. The blocklist matched substrings, so "skill" tripped "kill" and
//      "soldier" tripped "die". In a game about written combat that rejected
//      ordinary prompts, while a single space evaded it.

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  TextModerationProvider,
  hasTextModerationProvider,
} from '../_shared/moderation.ts';

const KEYS = ['OPENAI_API_KEY', 'PERSPECTIVE_API_KEY'] as const;

function withEnv(
  overrides: Partial<Record<(typeof KEYS)[number], string | null>>,
  fn: () => Promise<void> | void,
): Promise<void> | void {
  const saved = KEYS.map((k) => [k, Deno.env.get(k)] as const);
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) Deno.env.delete(k);
      else Deno.env.set(k, v as string);
    }
    return fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test('blocklist matches whole words, not substrings', async () => {
  await withEnv(
    { OPENAI_API_KEY: null, PERSPECTIVE_API_KEY: null },
    async () => {
      const provider = new TextModerationProvider();

      // These read as combat writing and must survive moderation.
      for (const legit of [
        'A duelist of terrifying skill parries the opening feint.',
        'The old soldier plants his banner and refuses to yield.',
        'Her diehard resolve outlasts the siege.',
      ]) {
        const result = await provider.moderate(legit);
        assertEquals(result.status, 'approved', `false positive on: ${legit}`);
      }

      // The actual blocked word still trips.
      const blocked = await provider.moderate(
        'I will kill you in real life you worthless human',
      );
      assertEquals(blocked.status === 'approved', false);
    },
  );
});

Deno.test(
  'with a classifier configured, combat vocabulary is not a blocklist matter',
  async () => {
    // "kill" and "die" are the fallback list: enforced only when there is no
    // classifier to read the context. With a key set (even a dead one) the
    // request reaches the provider path instead of being refused by the word.
    await withEnv(
      { OPENAI_API_KEY: 'sk-invalid-key-for-test', PERSPECTIVE_API_KEY: null },
      async () => {
        const result = await new TextModerationProvider().moderate(
          'She kills the momentum of his charge and lets the giant die on his feet.',
        );
        assertEquals(result.provider === 'blocklist', false);
        assertEquals(
          result.flaggedCategories?.includes('blocklist') ?? false,
          false,
        );
      },
    );
  },
);

Deno.test(
  'the hard blocklist applies even with a classifier configured',
  async () => {
    await withEnv(
      { OPENAI_API_KEY: 'sk-invalid-key-for-test', PERSPECTIVE_API_KEY: null },
      async () => {
        const result = await new TextModerationProvider().moderate(
          'Explicit nsfw content about the arena crowd and nothing else here.',
        );
        assertEquals(result.status, 'rejected');
        assertEquals(result.provider, 'blocklist');
      },
    );
  },
);

Deno.test(
  'no provider configured: blocklist only, still approves clean text',
  async () => {
    await withEnv(
      { OPENAI_API_KEY: null, PERSPECTIVE_API_KEY: null },
      async () => {
        assertEquals(hasTextModerationProvider(), false);
        const result = await new TextModerationProvider().moderate(
          'A lattice of mirrors folds the arena into a single blinding point.',
        );
        assertEquals(result.status, 'approved');
        assertEquals(result.provider, 'blocklist');
      },
    );
  },
);

Deno.test(
  'configured provider that fails is held for review, not approved',
  async () => {
    // A key that cannot succeed: the fetch fails, callExternalProvider returns
    // null, and the old code approved. It must now fail closed instead.
    await withEnv(
      { OPENAI_API_KEY: 'sk-invalid-key-for-test', PERSPECTIVE_API_KEY: null },
      async () => {
        assertEquals(hasTextModerationProvider(), true);
        const result = await new TextModerationProvider().moderate(
          'A perfectly ordinary prompt that should not be auto-approved ' +
            'while moderation is broken.',
        );

        assertEquals(
          result.status,
          'flagged_human_review',
          'a failing provider must not fall through to approved',
        );
        assertEquals(result.provider, 'unavailable');
        // submit-prompt blocks flagged_human_review, so the prompt is held.
      },
    );
  },
);
