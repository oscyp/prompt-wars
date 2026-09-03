// Tests for the pure half of regenerate-portrait: mode resolution, the free
// avatar-retry guard, and the replay response.
//
// The guard is the thing worth protecting. `avatar_only` costs nothing, so every
// case it lets through that it should not is a free render; every case it
// blocks that it should not leaves a player with a face that does not match
// the body they paid for.

import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  avatarRetryEligibility,
  replayPortraitIds,
  replayResponseFromEdit,
  resolveRenderMode,
} from '../_shared/render-look.ts';

// ---------------------------------------------------------------------------
// resolveRenderMode
// ---------------------------------------------------------------------------

Deno.test('render mode - recognises the three modes', () => {
  assertEquals(resolveRenderMode('render'), 'render');
  assertEquals(resolveRenderMode('random'), 'random');
  assertEquals(resolveRenderMode('avatar_only'), 'avatar_only');
});

Deno.test(
  'render mode - anything else is a plain render, never a paid extra',
  () => {
    assertEquals(resolveRenderMode(undefined), 'render');
    assertEquals(resolveRenderMode(null), 'render');
    assertEquals(resolveRenderMode(''), 'render');
    assertEquals(resolveRenderMode('RANDOM'), 'render');
    assertEquals(resolveRenderMode(42), 'render');
    assertEquals(resolveRenderMode({ mode: 'random' }), 'render');
  },
);

// ---------------------------------------------------------------------------
// avatarRetryEligibility
// ---------------------------------------------------------------------------

const character = { appearance_version: 1 };
const fighter = { id: 'fighter-1', appearance_version: 1 };

Deno.test('avatar retry - eligible when there is no avatar at all', () => {
  const result = avatarRetryEligibility({ character, fighter, avatar: null });
  assert(result.eligible);
  assertEquals(result.appearanceVersion, 1);
});

Deno.test(
  'avatar retry - eligible when the avatar is behind the fighter',
  () => {
    const result = avatarRetryEligibility({
      character,
      fighter,
      avatar: { id: 'avatar-0', appearance_version: 0 },
    });
    assert(result.eligible);
  },
);

Deno.test('avatar retry - refused when the avatar already matches', () => {
  const result = avatarRetryEligibility({
    character,
    fighter,
    avatar: { id: 'avatar-1', appearance_version: 1 },
  });
  assertEquals(result.eligible, false);
  if (!result.eligible) {
    assertEquals(result.code, 'avatar_current');
    assertEquals(result.status, 409);
  }
});

Deno.test(
  'avatar retry - an avatar ahead of the fighter is also current',
  () => {
    const result = avatarRetryEligibility({
      character,
      fighter,
      avatar: { id: 'avatar-2', appearance_version: 2 },
    });
    assertEquals(result.eligible, false);
    if (!result.eligible) assertEquals(result.code, 'avatar_current');
  },
);

Deno.test('avatar retry - a NULL avatar version counts as current', () => {
  // Rows predating the column were amnestied to "up to date" (20260827160000);
  // a free redraw of every pre-column avatar would be a free render for all.
  const result = avatarRetryEligibility({
    character,
    fighter,
    avatar: { id: 'avatar-legacy', appearance_version: null },
  });
  assertEquals(result.eligible, false);
  if (!result.eligible) assertEquals(result.code, 'avatar_current');
});

Deno.test(
  'avatar retry - refused when the fighter is behind the character',
  () => {
    // The player changed the look since; the honest path is a paid render.
    const result = avatarRetryEligibility({
      character: { appearance_version: 2 },
      fighter,
      avatar: null,
    });
    assertEquals(result.eligible, false);
    if (!result.eligible) {
      assertEquals(result.code, 'fighter_stale');
      assertEquals(result.status, 409);
    }
  },
);

Deno.test('avatar retry - refused when there is no fighter', () => {
  const result = avatarRetryEligibility({
    character,
    fighter: null,
    avatar: null,
  });
  assertEquals(result.eligible, false);
  if (!result.eligible) {
    assertEquals(result.code, 'conflict');
    assertEquals(result.status, 409);
  }
});

Deno.test(
  'avatar retry - NULL versions on fighter and character compare as zero',
  () => {
    const result = avatarRetryEligibility({
      character: { appearance_version: null },
      fighter: { id: 'fighter-legacy', appearance_version: null },
      avatar: null,
    });
    assert(result.eligible);
    assertEquals(result.appearanceVersion, 0);
  },
);

// ---------------------------------------------------------------------------
// replayResponseFromEdit
// ---------------------------------------------------------------------------

const portraits = {
  'fighter-1': {
    id: 'fighter-1',
    image_path: 'u/c/fighter-1.png',
    generation_job_id: 'job-f',
  },
  'avatar-1': {
    id: 'avatar-1',
    image_path: 'u/c/avatar-1.png',
    generation_job_id: 'job-a',
  },
};

Deno.test('replay - a render edit rebuilds the full success response', () => {
  const response = replayResponseFromEdit(
    {
      id: 'edit-1',
      edit_kind: 'regenerate_portrait',
      after: {
        portrait_id: 'fighter-1',
        avatar_portrait_id: 'avatar-1',
        mode: 'render',
      },
      credits_spent: 3,
    },
    portraits,
  );
  assertEquals(response, {
    portrait_id: 'fighter-1',
    image_path: 'u/c/fighter-1.png',
    avatar_portrait_id: 'avatar-1',
    avatar_image_path: 'u/c/avatar-1.png',
    avatar_pending: false,
    job_id: 'job-f',
    avatar_job_id: null,
    edit_id: 'edit-1',
    credits_spent: 3,
    mode: 'render',
    idempotent: true,
  });
});

Deno.test('replay - an avatar_only edit reports the avatar job', () => {
  const response = replayResponseFromEdit(
    {
      id: 'edit-2',
      edit_kind: 'regenerate_avatar',
      after: {
        portrait_id: 'fighter-1',
        avatar_portrait_id: 'avatar-1',
        mode: 'avatar_only',
      },
      credits_spent: 0,
    },
    portraits,
  );
  assertEquals(response.mode, 'avatar_only');
  assertEquals(response.job_id, 'job-a');
  assertEquals(response.credits_spent, 0);
  assertEquals(response.portrait_id, 'fighter-1');
  assertEquals(response.avatar_portrait_id, 'avatar-1');
  assertEquals(response.idempotent, true);
});

Deno.test('replay - a missing avatar is reported as pending', () => {
  const response = replayResponseFromEdit(
    {
      id: 'edit-3',
      edit_kind: 'regenerate_portrait',
      after: {
        portrait_id: 'fighter-1',
        avatar_portrait_id: null,
        mode: 'render',
      },
      credits_spent: 3,
    },
    portraits,
  );
  assertEquals(response.avatar_pending, true);
  assertEquals(response.avatar_portrait_id, null);
  assertEquals(response.avatar_image_path, null);
  assertEquals(response.job_id, 'job-f');
});

Deno.test(
  'replay - a legacy row without mode is told apart by edit_kind',
  () => {
    const random = replayResponseFromEdit(
      {
        id: 'e',
        edit_kind: 'traits',
        after: { portrait_id: 'fighter-1' },
        credits_spent: 5,
      },
      portraits,
    );
    assertEquals(random.mode, 'random');
    const render = replayResponseFromEdit(
      {
        id: 'e',
        edit_kind: 'regenerate_portrait',
        after: { portrait_id: 'fighter-1' },
        credits_spent: 1,
      },
      portraits,
    );
    assertEquals(render.mode, 'render');
  },
);

Deno.test(
  'replay - portrait rows that no longer exist degrade to nulls',
  () => {
    const response = replayResponseFromEdit(
      {
        id: 'edit-4',
        after: {
          portrait_id: 'gone',
          avatar_portrait_id: 'also-gone',
          mode: 'render',
        },
        credits_spent: 3,
      },
      {},
    );
    assertEquals(response.portrait_id, 'gone');
    assertEquals(response.image_path, null);
    assertEquals(response.job_id, null);
    assertEquals(response.avatar_image_path, null);
    assertEquals(response.avatar_pending, false);
  },
);

Deno.test('replay - portrait ids to load skip nulls and non-strings', () => {
  assertEquals(
    replayPortraitIds({
      id: 'e',
      after: { portrait_id: 'f', avatar_portrait_id: null },
      credits_spent: 0,
    }),
    ['f'],
  );
  assertEquals(
    replayPortraitIds({
      id: 'e',
      after: { portrait_id: 'f', avatar_portrait_id: 'a' },
      credits_spent: 0,
    }),
    ['f', 'a'],
  );
  assertEquals(
    replayPortraitIds({ id: 'e', after: null, credits_spent: 0 }),
    [],
  );
});
