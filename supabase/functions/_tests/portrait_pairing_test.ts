// Tests for fighter/avatar pairing on restore.
//
// Restoring a fighter without its avatar leaves an old body under a new face,
// permanently -- there is no paid action that produces just the matching face.
// So the pairing must prefer what the audit trail says the player saw together,
// and must refuse to guess when it cannot know.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pickPairedAvatar } from '../_shared/portrait-pairing.ts';

const fighter = {
  id: 'fighter-b',
  appearance_version: 2,
  created_at: '2026-09-01T12:00:00.000Z',
};

const candidates = [
  // Same version, produced a minute after the fighter: the natural pair.
  {
    id: 'avatar-b',
    kind: 'avatar',
    appearance_version: 2,
    created_at: '2026-09-01T12:01:00.000Z',
  },
  // Same version, an hour earlier: another render of the same look.
  {
    id: 'avatar-a',
    kind: 'avatar',
    appearance_version: 2,
    created_at: '2026-09-01T11:00:00.000Z',
  },
  // Different look.
  {
    id: 'avatar-old',
    kind: 'avatar',
    appearance_version: 1,
    created_at: '2026-09-01T12:00:30.000Z',
  },
];

Deno.test('pairing - the audit row wins over a nearer version match', () => {
  const edits = [
    {
      after: {
        portrait_id: 'fighter-b',
        avatar_portrait_id: 'avatar-a',
        mode: 'render',
      },
      created_at: '2026-09-01T12:01:05.000Z',
    },
  ];
  assertEquals(pickPairedAvatar(fighter, edits, candidates), 'avatar-a');
});

Deno.test('pairing - the newest audit row for the fighter wins', () => {
  // An avatar retry after the render is the pair the player last saw.
  const edits = [
    {
      after: {
        portrait_id: 'fighter-b',
        avatar_portrait_id: 'avatar-first',
        mode: 'render',
      },
      created_at: '2026-09-01T12:01:05.000Z',
    },
    {
      after: {
        portrait_id: 'fighter-b',
        avatar_portrait_id: 'avatar-retry',
        mode: 'avatar_only',
      },
      created_at: '2026-09-01T12:30:00.000Z',
    },
  ];
  assertEquals(pickPairedAvatar(fighter, edits, candidates), 'avatar-retry');
  // Order of the input must not matter.
  assertEquals(
    pickPairedAvatar(fighter, [...edits].reverse(), candidates),
    'avatar-retry',
  );
});

Deno.test(
  'pairing - audit rows for other fighters or without an avatar are skipped',
  () => {
    const edits = [
      {
        after: {
          portrait_id: 'fighter-c',
          avatar_portrait_id: 'avatar-c',
          mode: 'render',
        },
        created_at: '2026-09-01T13:00:00.000Z',
      },
      {
        after: {
          portrait_id: 'fighter-b',
          avatar_portrait_id: null,
          mode: 'render',
        },
        created_at: '2026-09-01T12:01:05.000Z',
      },
      { after: null, created_at: '2026-09-01T12:02:00.000Z' },
    ];
    // Falls through to the version match.
    assertEquals(pickPairedAvatar(fighter, edits, candidates), 'avatar-b');
  },
);

Deno.test('pairing - version fallback picks the avatar nearest in time', () => {
  assertEquals(pickPairedAvatar(fighter, [], candidates), 'avatar-b');
});

Deno.test(
  'pairing - version fallback ignores other versions even when nearer',
  () => {
    // avatar-old is 30s away but depicts a different look.
    const onlyOther = candidates.filter(
      (c) => c.id !== 'avatar-b' && c.id !== 'avatar-a',
    );
    assertEquals(pickPairedAvatar(fighter, [], onlyOther), null);
  },
);

Deno.test('pairing - version fallback ignores rejected avatars', () => {
  const withRejected = [
    { ...candidates[0], moderation_status: 'rejected' },
    candidates[1],
  ];
  assertEquals(pickPairedAvatar(fighter, [], withRejected), 'avatar-a');
});

Deno.test(
  'pairing - version fallback ignores rows that are not avatars',
  () => {
    const fighters = [
      {
        id: 'fighter-x',
        kind: 'fighter',
        appearance_version: 2,
        created_at: fighter.created_at,
      },
    ];
    assertEquals(pickPairedAvatar(fighter, [], fighters), null);
  },
);

Deno.test(
  'pairing - a fighter without a version is never matched by version',
  () => {
    // NULL means "unknown look"; pairing by it would join strangers.
    const legacy = { ...fighter, appearance_version: null };
    assertEquals(pickPairedAvatar(legacy, [], candidates), null);
  },
);

Deno.test(
  'pairing - the audit row still applies to a fighter without a version',
  () => {
    const legacy = { ...fighter, appearance_version: null };
    const edits = [
      {
        after: { portrait_id: 'fighter-b', avatar_portrait_id: 'avatar-a' },
        created_at: '2026-09-01T12:01:05.000Z',
      },
    ];
    assertEquals(pickPairedAvatar(legacy, edits, candidates), 'avatar-a');
  },
);

Deno.test('pairing - null with nothing to go on', () => {
  assertEquals(pickPairedAvatar(fighter, [], []), null);
});
