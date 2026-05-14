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
  waitForPortraitJob,
  type TestCharacterFixture,
  type TestUserFixture,
} from './remote-character-helpers.ts';

Deno.test('remote edit-character updates signature color and writes audit row', async () => {
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
});

Deno.test('remote edit-character blocks edits while character is in an active battle', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'active-battle-lock');
    await createActiveBattle(fixture);

    const result = await invokeFunction(config, fixture.accessToken, 'edit-character', {
      character_id: fixture.characterId,
      edit_kind: 'battle_cry',
      payload: { battle_cry: 'Still locked' },
      idempotency_key: crypto.randomUUID(),
    });

    assertFunctionError(result, 409, 'battle_locked');
  } finally {
    if (fixture) await cancelNonFinalBattles(fixture);
    await cleanupFixture(fixture);
  }
});

Deno.test('remote edit-character spends credits for a trait swap', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'trait-swap');
    await grantCredits(fixture, 10);
    const beforeBalance = await getCreditBalance(fixture);

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
    assertEquals(data.credits_spent, 1);

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
    assertEquals(afterBalance, beforeBalance - 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote list-signature-items-catalog returns item contract', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestUserFixture | undefined;
  try {
    fixture = await createTestUser(config, 'catalog');
    const result = await invokeFunction<{ items: Array<Record<string, unknown>> }>(
      config,
      fixture.accessToken,
      'list-signature-items-catalog',
      {},
    );

    const data = assertOk(result);
    assert(data.items.length > 0, 'remote catalog should contain seeded items');
    const item = data.items[0];
    assertEquals(typeof item.id, 'string');
    assertEquals(typeof item.name, 'string');
    assertEquals(typeof item.description, 'string');
    assertEquals(typeof item.itemClass, 'string');
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote create-custom-signature-item creates text-only item and spends credits', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestUserFixture | undefined;
  try {
    fixture = await createTestUser(config, 'custom-item-text');
    await grantCredits(fixture, 10);
    const beforeBalance = await getCreditBalance(fixture);

    const result = await invokeFunction<{
      item: { id: string; name: string; item_class?: string; itemClass?: string };
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
      .select('name, item_class, prompt_fragment, moderation_status, image_path')
      .eq('id', data.item.id)
      .single();
    assertEquals(itemError, null, itemError?.message);
    assertExists(item);
    assertEquals(item.name, 'Remote Test Pencil');
    assertEquals(item.item_class, 'tool');
    assertEquals(item.prompt_fragment, 'a precise blue pencil held like a drafting tool');
    assertEquals(item.moderation_status, 'approved');
    assertEquals(item.image_path, null);

    const afterBalance = await getCreditBalance(fixture);
    assertEquals(afterBalance, beforeBalance - 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote create-custom-signature-item creates generated icon item with real provider', async () => {
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
});

Deno.test('remote generate-portrait and regenerate-portrait create current portraits', async () => {
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
      portrait_prompt_raw: 'A clean heroic strategist portrait for remote test',
      idempotency_key: crypto.randomUUID(),
    });
    const initial = assertOk(initialResult);
    assertExists(initial.job_id);
    assertExists(initial.portrait_id);
    await waitForPortraitJob(fixture.admin, initial.job_id);

    const beforeBalance = await getCreditBalance(fixture);
    const regenResult = await invokeFunction<{
      job_id: string;
      portrait_id: string;
      image_path: string;
      credits_spent: number;
    }>(config, fixture.accessToken, 'regenerate-portrait', {
      character_id: fixture.characterId,
      idempotency_key: crypto.randomUUID(),
    });
    const regen = assertOk(regenResult);
    assertEquals(regen.credits_spent, 1);
    assertExists(regen.job_id);
    assertExists(regen.portrait_id);
    await waitForPortraitJob(fixture.admin, regen.job_id);

    const { data: portraits, error: portraitsError } = await fixture.admin
      .from('character_portraits')
      .select('id, is_current')
      .eq('character_id', fixture.characterId);
    assertEquals(portraitsError, null, portraitsError?.message);
    assertExists(portraits);
    assertEquals(portraits.filter((portrait) => portrait.is_current).length, 1);
    assert(portraits.length >= 2, 'regeneration should create a second portrait row');

    const afterBalance = await getCreditBalance(fixture);
    assertEquals(afterBalance, beforeBalance - 1);
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote regenerate-portrait without seed returns conflict', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  let fixture: TestCharacterFixture | undefined;
  try {
    fixture = await createTestCharacter(config, 'regen-no-seed', {
      portrait_seed: null,
      portrait_id: null,
    });
    await grantCredits(fixture, 5);

    const result = await invokeFunction(config, fixture.accessToken, 'regenerate-portrait', {
      character_id: fixture.characterId,
      idempotency_key: crypto.randomUUID(),
    });

    assertFunctionError(result, 409, 'conflict');
  } finally {
    await cleanupFixture(fixture);
  }
});

Deno.test('remote required functions are deployed', async () => {
  const config = skipUnlessRemoteEnabled();
  if (!config) return;

  const admin = createAdminClient(config);
  const requiredFunctions = [
    'edit-character',
    'create-custom-signature-item',
    'list-signature-items-catalog',
    'generate-portrait',
    'regenerate-portrait',
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
