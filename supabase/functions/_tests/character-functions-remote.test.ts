import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assertFunctionError,
  assertOk,
  cancelNonFinalBattles,
  cleanupFixture,
  createActiveBattle,
  createAdminClient,
  createTestCharacter,
  createTestUser,
  getCreditBalance,
  grantCredits,
  invokeFunction,
  skipUnlessRemoteEnabled,
  type TestCharacterFixture,
  type TestUserFixture,
  waitForPortraitJob,
} from './remote-character-helpers.ts';

/** The response shape every mode of regenerate-portrait returns. */
interface RenderLookData {
  portrait_id: string;
  image_path: string;
  avatar_portrait_id: string | null;
  avatar_image_path: string | null;
  avatar_pending: boolean;
  job_id: string;
  avatar_job_id: null;
  edit_id: string | null;
  credits_spent: number;
  mode: 'render' | 'random' | 'avatar_only';
  idempotent?: true;
}

/**
 * The live price of a `character_edit_prices` key. The ladder is repriced by
 * migration without a deploy, so a test that hard-codes a number is asserting
 * the migration history rather than the function.
 */
async function editPriceCredits(
  admin: TestUserFixture['admin'],
  editKind: string,
): Promise<number> {
  const { data, error } = await admin
    .from('character_edit_prices')
    .select('credits')
    .eq('edit_kind', editKind)
    .single();
  assertEquals(
    error,
    null,
    `price lookup failed for ${editKind}: ${error?.message}`,
  );
  return Number(data?.credits ?? 0);
}

/** Spends the fixture down to zero so a 402 is guaranteed regardless of welcome grants. */
async function drainCredits(fixture: TestUserFixture): Promise<void> {
  const balance = await getCreditBalance(fixture);
  if (balance <= 0) return;
  const { error } = await fixture.admin.rpc('spend_credits', {
    p_profile_id: fixture.profileId,
    p_amount: balance,
    p_reason: 'remote_test_drain',
    p_idempotency_key: `remote_test_drain_${fixture.profileId}_${crypto.randomUUID()}`,
    p_battle_id: null,
    p_video_job_id: null,
    p_metadata: { test: true },
  });
  assertEquals(error, null, `spend_credits drain failed: ${error?.message}`);
}

/** Creates a seedless character and runs its first free render; returns the fighter. */
async function generateFirstPortrait(
  config: NonNullable<ReturnType<typeof skipUnlessRemoteEnabled>>,
  fixture: TestCharacterFixture,
): Promise<{ job_id: string; portrait_id: string; image_path: string }> {
  const result = await invokeFunction<{
    job_id: string;
    portrait_id: string;
    image_path: string;
  }>(config, fixture.accessToken, 'generate-portrait', {
    character_id: fixture.characterId,
    portrait_prompt_raw: 'A clean heroic strategist portrait for remote test',
    idempotency_key: crypto.randomUUID(),
  });
  const data = assertOk(result);
  assertExists(data.job_id);
  assertExists(data.portrait_id);
  await waitForPortraitJob(fixture.admin, data.job_id);
  return data;
}

Deno.test(
  'remote edit-character updates signature color and writes audit row',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'signature-color');
      const result = await invokeFunction<{
        character: { id: string; signature_color?: string };
        edit_id: string | null;
        credits_spent: number;
      }>(config, fixture.accessToken, 'edit-character', {
        character_id: fixture.characterId,
        edit_kind: 'signature_color',
        payload: { signature_color: '#00B5FF' },
        idempotency_key: crypto.randomUUID(),
      });

      const data = assertOk(result);
      assertEquals(data.credits_spent, 0);
      assertExists(data.edit_id);

      const { data: character, error: characterError } = await fixture.admin
        .from('characters')
        .select('signature_color')
        .eq('id', fixture.characterId)
        .single();
      assertEquals(characterError, null, characterError?.message);
      assertExists(character);
      assertEquals(character.signature_color, '#00B5FF');

      const { data: edit, error: editError } = await fixture.admin
        .from('character_edits')
        .select('edit_kind, credits_spent, after')
        .eq('id', data.edit_id)
        .single();
      assertEquals(editError, null, editError?.message);
      assertExists(edit);
      assertEquals(edit.edit_kind, 'signature_color');
      assertEquals(edit.credits_spent, 0);
      assertEquals(edit.after.signature_color, '#00B5FF');
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote edit-character blocks edits while character is in an active battle',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'active-battle-lock');
      await createActiveBattle(fixture);

      const result = await invokeFunction(
        config,
        fixture.accessToken,
        'edit-character',
        {
          character_id: fixture.characterId,
          edit_kind: 'battle_cry',
          payload: { battle_cry: 'Still locked' },
          idempotency_key: crypto.randomUUID(),
        },
      );

      assertFunctionError(result, 409, 'battle_locked');
    } finally {
      if (fixture) await cancelNonFinalBattles(fixture);
      await cleanupFixture(fixture);
    }
  },
);

Deno.test('remote edit-character spends credits for a trait swap', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'trait-swap');
    await grantCredits(fixture, 10);
    const beforeBalance = await getCreditBalance(fixture);
    // Describing a character is free since 20260827170000; the price row is
    // the source of truth rather than a constant this test used to assume.
    const swapPrice = await editPriceCredits(
      fixture.admin,
      'traits_single_swap',
    );

    const result = await invokeFunction<{
      character: { id: string };
      edit_id: string | null;
      credits_spent: number;
    }>(config, fixture.accessToken, 'edit-character', {
      character_id: fixture.characterId,
      edit_kind: 'traits_single_swap',
      payload: { trait: 'vibe', value: 'regal' },
      idempotency_key: crypto.randomUUID(),
    });

    const data = assertOk(result);
    assertEquals(data.credits_spent, swapPrice);

    const { data: character, error: characterError } = await fixture.admin
      .from('characters')
      .select('vibe, traits_version')
      .eq('id', fixture.characterId)
      .single();
    assertEquals(characterError, null, characterError?.message);
    assertExists(character);
    assertEquals(character.vibe, 'regal');
    assertEquals(character.traits_version, 1);

    const afterBalance = await getCreditBalance(fixture);
    assertEquals(afterBalance, beforeBalance - swapPrice);
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test(
  'remote list-signature-items-catalog returns item contract',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestUserFixture | undefined;
    try {
      fixture = await createTestUser(config, 'catalog');
      const result = await invokeFunction<{ items: Record<string, unknown>[] }>(
        config,
        fixture.accessToken,
        'list-signature-items-catalog',
        {},
      );

      const data = assertOk(result);
      assert(
        data.items.length > 0,
        'remote catalog should contain seeded items',
      );
      const item = data.items[0];
      assertEquals(typeof item.id, 'string');
      assertEquals(typeof item.catalogId, 'string');
      assertEquals(typeof item.name, 'string');
      assertEquals(typeof item.description, 'string');
      assertEquals(typeof item.itemClass, 'string');

      const { data: signatureItem, error: signatureItemError } =
        await fixture.admin
          .from('signature_items')
          .select('id, kind, catalog_id')
          .eq('id', item.id)
          .single();
      assertEquals(signatureItemError, null, signatureItemError?.message);
      assertExists(signatureItem);
      assertEquals(signatureItem.kind, 'catalog');
      assertEquals(signatureItem.catalog_id, item.catalogId);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote finalize-character-creation accepts catalog signature item id',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'finalize-catalog-item', {
        battle_cry: '\u2026',
        is_active: false,
      });
      const catalogResult = await invokeFunction<{
        items: Record<string, unknown>[];
      }>(config, fixture.accessToken, 'list-signature-items-catalog', {});
      const catalogData = assertOk(catalogResult);
      assert(
        catalogData.items.length > 0,
        'remote catalog should contain seeded items',
      );

      const item = catalogData.items[0];
      assertEquals(typeof item.id, 'string');

      const result = await invokeFunction<{ character_id: string }>(
        config,
        fixture.accessToken,
        'finalize-character-creation',
        {
          character_id: fixture.characterId,
          name: 'Catalog Finisher',
          archetype: 'strategist',
          battle_cry: 'Ready for the arena',
          signature_color: '#6366F1',
          signature_item_id: item.id,
          // Creation-time allocation: the whole 20-point pool, shaped.
          stats: { strength: 8, stamina: 6, agility: 3, focus: 3 },
        },
      );

      const data = assertOk(result);
      assertEquals(data.character_id, fixture.characterId);

      const { data: character, error: characterError } = await fixture.admin
        .from('characters')
        .select(
          'battle_cry, signature_item_id, stat_strength, stat_stamina, stat_agility, stat_focus',
        )
        .eq('id', fixture.characterId)
        .single();
      assertEquals(characterError, null, characterError?.message);
      assertExists(character);
      assertEquals(character.battle_cry, 'Ready for the arena');
      assertEquals(character.signature_item_id, item.id);
      assertEquals(character.stat_strength, 8);
      assertEquals(character.stat_stamina, 6);
      assertEquals(character.stat_agility, 3);
      assertEquals(character.stat_focus, 3);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote finalize-character-creation rejects a stat allocation that does not spend the pool',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'finalize-bad-stats', {
        battle_cry: '\u2026',
        is_active: false,
      });
      const result = await invokeFunction<{ character_id: string }>(
        config,
        fixture.accessToken,
        'finalize-character-creation',
        {
          character_id: fixture.characterId,
          name: 'Under Spender',
          archetype: 'strategist',
          battle_cry: 'Ready for the arena',
          signature_color: '#6366F1',
          stats: { strength: 5, stamina: 5, agility: 5, focus: 4 },
        },
      );
      assertFunctionError(result, 400, 'bad_request');

      // Nothing was written: the row is still a draft with default stats.
      const { data: character } = await fixture.admin
        .from('characters')
        .select('finalized_at, stat_focus')
        .eq('id', fixture.characterId)
        .single();
      assertExists(character);
      assertEquals(character.finalized_at, null);
      assertEquals(character.stat_focus, 5);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote create-custom-signature-item creates text-only item and spends credits',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestUserFixture | undefined;
    try {
      fixture = await createTestUser(config, 'custom-item-text');
      await grantCredits(fixture, 10);
      const beforeBalance = await getCreditBalance(fixture);

      const result = await invokeFunction<{
        item: {
          id: string;
          name: string;
          item_class?: string;
          itemClass?: string;
        };
        credits_spent: number;
      }>(config, fixture.accessToken, 'create-custom-signature-item', {
        name: 'Remote Test Pencil',
        description: 'Blue Pencil',
        item_class: 'tool',
        prompt_fragment: 'a precise blue pencil held like a drafting tool',
        with_image: false,
        idempotency_key: crypto.randomUUID(),
      });

      const data = assertOk(result);
      assertEquals(data.credits_spent, 1);
      assertExists(data.item.id);

      const { data: item, error: itemError } = await fixture.admin
        .from('signature_items')
        .select(
          'name, item_class, prompt_fragment, moderation_status, image_path',
        )
        .eq('id', data.item.id)
        .single();
      assertEquals(itemError, null, itemError?.message);
      assertExists(item);
      assertEquals(item.name, 'Remote Test Pencil');
      assertEquals(item.item_class, 'tool');
      assertEquals(
        item.prompt_fragment,
        'a precise blue pencil held like a drafting tool',
      );
      assertEquals(item.moderation_status, 'approved');
      assertEquals(item.image_path, null);

      const afterBalance = await getCreditBalance(fixture);
      assertEquals(afterBalance, beforeBalance - 1);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote create-custom-signature-item creates generated icon item with real provider',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestUserFixture | undefined;
    try {
      fixture = await createTestUser(config, 'custom-item-image');
      await grantCredits(fixture, 20);
      const beforeBalance = await getCreditBalance(fixture);

      const result = await invokeFunction<{
        item: { id: string; name: string };
        credits_spent: number;
      }>(config, fixture.accessToken, 'create-custom-signature-item', {
        name: 'Remote Blue Pencil',
        description: 'Blue Pencil',
        item_class: 'tool',
        prompt_fragment: 'a clean blue pencil with a sharp graphite point',
        with_image: true,
        idempotency_key: crypto.randomUUID(),
      });

      const data = assertOk(result);
      assertEquals(data.credits_spent, 3);

      const { data: item, error: itemError } = await fixture.admin
        .from('signature_items')
        .select('image_path, moderation_status')
        .eq('id', data.item.id)
        .single();
      assertEquals(itemError, null, itemError?.message);
      assertExists(item);
      assertEquals(typeof item.image_path, 'string');
      assertEquals(item.moderation_status, 'pending');

      const afterBalance = await getCreditBalance(fixture);
      assertEquals(afterBalance, beforeBalance - 3);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote generate-portrait and regenerate-portrait create current portraits',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'portraits', {
        portrait_seed: null,
        portrait_id: null,
      });
      await grantCredits(fixture, 10);

      const initialResult = await invokeFunction<{
        job_id: string;
        portrait_id: string;
        image_path: string;
      }>(config, fixture.accessToken, 'generate-portrait', {
        character_id: fixture.characterId,
        portrait_prompt_raw:
          'A clean heroic strategist portrait for remote test',
        idempotency_key: crypto.randomUUID(),
      });
      const initial = assertOk(initialResult);
      assertExists(initial.job_id);
      assertExists(initial.portrait_id);
      await waitForPortraitJob(fixture.admin, initial.job_id);

      const renderPrice = await editPriceCredits(fixture.admin, 'render_look');
      const beforeBalance = await getCreditBalance(fixture);
      const regenResult = await invokeFunction<RenderLookData>(
        config,
        fixture.accessToken,
        'regenerate-portrait',
        {
          character_id: fixture.characterId,
          idempotency_key: crypto.randomUUID(),
        },
      );
      const regen = assertOk(regenResult);
      assertEquals(regen.credits_spent, renderPrice);
      assertEquals(regen.mode, 'render');
      assertEquals(regen.avatar_job_id, null);
      assertExists(regen.job_id);
      assertExists(regen.portrait_id);
      await waitForPortraitJob(fixture.admin, regen.job_id);

      // One current row PER KIND: a render produces a fighter and an avatar.
      const { data: portraits, error: portraitsError } = await fixture.admin
        .from('character_portraits')
        .select('id, kind, is_current')
        .eq('character_id', fixture.characterId);
      assertEquals(portraitsError, null, portraitsError?.message);
      assertExists(portraits);
      const currentFighters = portraits.filter(
        (p) => p.is_current && p.kind === 'fighter',
      );
      const currentAvatars = portraits.filter(
        (p) => p.is_current && p.kind === 'avatar',
      );
      assertEquals(currentFighters.length, 1);
      assertEquals(currentFighters[0].id, regen.portrait_id);
      assert(currentAvatars.length <= 1, 'at most one current avatar');
      assert(
        portraits.length >= 2,
        'regeneration should create a second portrait row',
      );

      const afterBalance = await getCreditBalance(fixture);
      assertEquals(afterBalance, beforeBalance - renderPrice);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote regenerate-portrait avatar_only is free and refuses once the avatar is current',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'avatar-only', {
        portrait_seed: null,
        portrait_id: null,
      });
      await grantCredits(fixture, 10);
      const initial = await generateFirstPortrait(config, fixture);

      // Reproduce the half-success the retry exists for: fighter landed, no
      // avatar. Detaching the pointer is enough; eligibility reads the pointers.
      const { error: detachErr } = await fixture.admin
        .from('characters')
        .update({ avatar_portrait_id: null })
        .eq('id', fixture.characterId);
      assertEquals(detachErr, null, detachErr?.message);

      const beforeBalance = await getCreditBalance(fixture);
      const retry = assertOk(
        await invokeFunction<RenderLookData>(
          config,
          fixture.accessToken,
          'regenerate-portrait',
          {
            character_id: fixture.characterId,
            mode: 'avatar_only',
          },
        ),
      );
      assertEquals(retry.mode, 'avatar_only');
      assertEquals(retry.credits_spent, 0);
      assertEquals(retry.avatar_pending, false);
      assertEquals(retry.avatar_job_id, null);
      assertEquals(
        retry.portrait_id,
        initial.portrait_id,
        'the fighter is untouched',
      );
      assertExists(retry.avatar_portrait_id);
      assertEquals(typeof retry.avatar_image_path, 'string');
      assertExists(retry.job_id);
      assertExists(retry.edit_id);
      await waitForPortraitJob(fixture.admin, retry.job_id);
      assertEquals(
        await getCreditBalance(fixture),
        beforeBalance,
        'the retry is free',
      );

      const { data: character, error: charErr } = await fixture.admin
        .from('characters')
        .select('portrait_id, avatar_portrait_id, appearance_version')
        .eq('id', fixture.characterId)
        .single();
      assertEquals(charErr, null, charErr?.message);
      assertExists(character);
      assertEquals(character.portrait_id, initial.portrait_id);
      assertEquals(character.avatar_portrait_id, retry.avatar_portrait_id);

      const { data: avatarRow, error: avatarErr } = await fixture.admin
        .from('character_portraits')
        .select('kind, is_current, appearance_version')
        .eq('id', retry.avatar_portrait_id)
        .single();
      assertEquals(avatarErr, null, avatarErr?.message);
      assertExists(avatarRow);
      assertEquals(avatarRow.kind, 'avatar');
      assertEquals(avatarRow.is_current, true);
      assertEquals(avatarRow.appearance_version, character.appearance_version);

      const { data: edit, error: editErr } = await fixture.admin
        .from('character_edits')
        .select('edit_kind, credits_spent, after')
        .eq('id', retry.edit_id)
        .single();
      assertEquals(editErr, null, editErr?.message);
      assertExists(edit);
      assertEquals(edit.edit_kind, 'regenerate_avatar');
      assertEquals(edit.credits_spent, 0);
      assertEquals(edit.after.mode, 'avatar_only');
      assertEquals(edit.after.portrait_id, initial.portrait_id);

      // The avatar now matches the fighter; a second tap has nothing to fix.
      const again = await invokeFunction(
        config,
        fixture.accessToken,
        'regenerate-portrait',
        {
          character_id: fixture.characterId,
          mode: 'avatar_only',
        },
      );
      assertFunctionError(again, 409, 'avatar_current');
      assertEquals(await getCreditBalance(fixture), beforeBalance);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote restore-portrait brings the paired avatar back with a fighter',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'restore-pair', {
        portrait_seed: null,
        portrait_id: null,
      });
      await grantCredits(fixture, 10);
      await generateFirstPortrait(config, fixture);

      // Two paid renders, so the first one is history with a known pair.
      const first = assertOk(
        await invokeFunction<RenderLookData>(
          config,
          fixture.accessToken,
          'regenerate-portrait',
          {
            character_id: fixture.characterId,
            mode: 'render',
            idempotency_key: crypto.randomUUID(),
          },
        ),
      );
      await waitForPortraitJob(fixture.admin, first.job_id);
      assertExists(
        first.avatar_portrait_id,
        'first render avatar leg failed (provider); pairing cannot be tested',
      );

      const second = assertOk(
        await invokeFunction<RenderLookData>(
          config,
          fixture.accessToken,
          'regenerate-portrait',
          {
            character_id: fixture.characterId,
            mode: 'render',
            idempotency_key: crypto.randomUUID(),
          },
        ),
      );
      await waitForPortraitJob(fixture.admin, second.job_id);
      assertExists(
        second.avatar_portrait_id,
        'second render avatar leg failed (provider); pairing cannot be tested',
      );
      assert(first.portrait_id !== second.portrait_id);

      const restored = assertOk(
        await invokeFunction<{
          portrait_id: string;
          kind: string;
          image_path: string;
          edit_id: string | null;
          avatar_portrait_id: string | null;
          avatar_restored: boolean;
        }>(config, fixture.accessToken, 'restore-portrait', {
          character_id: fixture.characterId,
          portrait_id: first.portrait_id,
        }),
      );
      assertEquals(restored.portrait_id, first.portrait_id);
      assertEquals(restored.kind, 'fighter');
      assertEquals(restored.avatar_restored, true);
      assertEquals(restored.avatar_portrait_id, first.avatar_portrait_id);
      assertExists(restored.edit_id);

      const { data: character, error: charErr } = await fixture.admin
        .from('characters')
        .select('portrait_id, avatar_portrait_id')
        .eq('id', fixture.characterId)
        .single();
      assertEquals(charErr, null, charErr?.message);
      assertExists(character);
      assertEquals(character.portrait_id, first.portrait_id);
      assertEquals(character.avatar_portrait_id, first.avatar_portrait_id);

      const { data: current, error: currentErr } = await fixture.admin
        .from('character_portraits')
        .select('id, kind')
        .eq('character_id', fixture.characterId)
        .eq('is_current', true);
      assertEquals(currentErr, null, currentErr?.message);
      assertExists(current);
      assertEquals(
        current.map((p) => p.id).sort(),
        [first.portrait_id, first.avatar_portrait_id].sort(),
        'exactly the restored pair is current',
      );

      const { data: edit, error: editErr } = await fixture.admin
        .from('character_edits')
        .select('edit_kind, credits_spent, before, after')
        .eq('id', restored.edit_id)
        .single();
      assertEquals(editErr, null, editErr?.message);
      assertExists(edit);
      assertEquals(edit.edit_kind, 'portrait_restore');
      assertEquals(edit.credits_spent, 0);
      assertEquals(edit.before.portrait_id, second.portrait_id);
      assertEquals(edit.before.avatar_portrait_id, second.avatar_portrait_id);
      assertEquals(edit.after.portrait_id, first.portrait_id);
      assertEquals(edit.after.avatar_portrait_id, first.avatar_portrait_id);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test('remote regenerate-portrait 402 carries the shortfall', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestCharacterFixture | undefined;
  try {
    // A seed is enough to reach the charge; the 402 must land before any render.
    fixture = await createTestCharacter(config, 'shortfall', {
      portrait_seed: 424242,
      portrait_id: null,
    });
    await drainCredits(fixture);
    const price = await editPriceCredits(fixture.admin, 'render_look');
    assert(price > 0, 'render_look must be priced for a 402 to be reachable');

    const result = await invokeFunction(
      config,
      fixture.accessToken,
      'regenerate-portrait',
      {
        character_id: fixture.characterId,
        mode: 'render',
        idempotency_key: crypto.randomUUID(),
      },
    );
    assertFunctionError(result, 402, 'insufficient_credits');
    const error = (result.body as { error: Record<string, unknown> }).error;
    assertEquals(error.price, price);
    assertEquals(error.balance, 0);
    assertEquals(error.shortfall, price);
    assertEquals(await getCreditBalance(fixture), 0, 'nothing was charged');
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test(
  'remote regenerate-portrait replays the same idempotency key without charging twice',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'idempotent-render', {
        portrait_seed: null,
        portrait_id: null,
      });
      await grantCredits(fixture, 10);
      await generateFirstPortrait(config, fixture);

      const price = await editPriceCredits(fixture.admin, 'render_look');
      const beforeBalance = await getCreditBalance(fixture);
      const key = crypto.randomUUID();

      const first = assertOk(
        await invokeFunction<RenderLookData>(
          config,
          fixture.accessToken,
          'regenerate-portrait',
          {
            character_id: fixture.characterId,
            mode: 'render',
            idempotency_key: key,
          },
        ),
      );
      assertEquals(first.idempotent, undefined);
      assertEquals(first.credits_spent, price);
      assertExists(first.job_id);
      await waitForPortraitJob(fixture.admin, first.job_id);

      const replay = assertOk(
        await invokeFunction<RenderLookData>(
          config,
          fixture.accessToken,
          'regenerate-portrait',
          {
            character_id: fixture.characterId,
            mode: 'render',
            idempotency_key: key,
          },
        ),
      );
      assertEquals(replay.idempotent, true);
      assertExists(
        replay.job_id,
        'a replay must carry the job id the client requires',
      );
      assertEquals(replay.job_id, first.job_id);
      assertEquals(replay.portrait_id, first.portrait_id);
      assertEquals(replay.image_path, first.image_path);
      assertEquals(replay.avatar_portrait_id, first.avatar_portrait_id);
      assertEquals(replay.avatar_image_path, first.avatar_image_path);
      assertEquals(replay.edit_id, first.edit_id);
      assertEquals(replay.credits_spent, price);
      assertEquals(replay.mode, 'render');

      assertEquals(
        await getCreditBalance(fixture),
        beforeBalance - price,
        'charged once',
      );

      // One render's worth of jobs (fighter + avatar); the replay rendered nothing.
      const { data: jobs, error: jobsErr } = await fixture.admin
        .from('portrait_jobs')
        .select('id')
        .eq('character_id', fixture.characterId)
        .eq('kind', 'regenerate');
      assertEquals(jobsErr, null, jobsErr?.message);
      assertExists(jobs);
      assertEquals(jobs.length, 2);
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test(
  'remote regenerate-portrait without seed returns conflict',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestCharacterFixture | undefined;
    try {
      fixture = await createTestCharacter(config, 'regen-no-seed', {
        portrait_seed: null,
        portrait_id: null,
      });
      await grantCredits(fixture, 5);

      const result = await invokeFunction(
        config,
        fixture.accessToken,
        'regenerate-portrait',
        {
          character_id: fixture.characterId,
          idempotency_key: crypto.randomUUID(),
        },
      );

      assertFunctionError(result, 409, 'conflict');
    } finally {
      await cleanupFixture(fixture);
    }
  },
);

Deno.test('remote required functions are deployed', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  const admin = createAdminClient(config);
  const requiredFunctions = [
    'edit-character',
    'finalize-character-creation',
    'create-custom-signature-item',
    'list-signature-items-catalog',
    'generate-portrait',
    'regenerate-portrait',
    'restore-portrait',
  ];

  for (const functionName of requiredFunctions) {
    const { data, error } = await admin.functions.invoke(functionName, {
      body: {},
    });
    if (error) {
      const message = String(error.message ?? '');
      assert(
        !/not found|Requested function was not found/i.test(message),
        `${functionName} is not deployed: ${message}`,
      );
    } else {
      assertExists(data, `${functionName} returned no response`);
    }
  }
});

/**
 * Regression for 2026-09-03: onboarding inserts the draft character row from
 * the CLIENT (app/(onboarding)/create-character.tsx), so the BEFORE INSERT
 * trigger characters_assign_default_item runs as `authenticated`. Its helper,
 * default_signature_item_for, was executable by postgres and service_role
 * only, and every new player's portrait step failed with 42501. The admin
 * client used by createTestCharacter never saw it. Migration 20260903005500
 * makes the trigger function SECURITY DEFINER.
 */
Deno.test(
  'onboarding: an authenticated client can insert its draft character and receives a default item',
  async () => {
    const config = skipUnlessRemoteEnabled();
    if (!config) return;

    let fixture: TestUserFixture | undefined;
    try {
      fixture = await createTestUser(config, 'draft-insert');
      const { data, error } = await fixture.userClient
        .from('characters')
        .insert({
          profile_id: fixture.profileId,
          name: 'PW draft',
          archetype: 'strategist',
          // The placeholder finalize-character-creation recognises a draft by.
          battle_cry: '\u2026',
        })
        .select('id, signature_item_id')
        .single();

      assertEquals(
        error,
        null,
        `draft insert as the player failed: ${error?.message}`,
      );
      assertExists(
        data?.signature_item_id,
        'BEFORE INSERT trigger assigned no default signature item',
      );
    } finally {
      await cleanupFixture(fixture);
    }
  },
);
