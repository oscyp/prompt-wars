import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  contractVersion,
  availableToClient,
  equipPolicy,
  catalogFromReads,
  purchaseResponse,
} from '../cosmetics/policy.ts';
Deno.test('invalid or missing contract versions default to legacy', () => {
  for (const version of [undefined, null, '2', -1, 1.5])
    assertEquals(contractVersion(version), 1);
  assertEquals(contractVersion(2), 2);
});
Deno.test('legacy/new catalog and purchase policy use minimum version', () => {
  assertEquals(
    availableToClient(
      { cosmetic_type: 'frame', min_client_contract_version: 2 },
      1,
    ),
    false,
  );
  assertEquals(
    availableToClient(
      { cosmetic_type: 'frame', min_client_contract_version: 2 },
      2,
    ),
    true,
  );
  assertEquals(availableToClient({ cosmetic_type: 'frame' }, 1), true);
  assertEquals(availableToClient({ cosmetic_type: 'reveal_style' }, 2), false);
});
Deno.test('equip blocks unsupported and identity-changing slots', () => {
  assertEquals(equipPolicy('color'), false);
  assertEquals(equipPolicy('reveal_style'), false);
  assertEquals(equipPolicy('frame'), true);
  assertEquals(equipPolicy('unknown'), false);
});
Deno.test('catalog merges authoritative ownership and filters version', () => {
  const result = catalogFromReads(
    {
      data: [
        { id: 'a', cosmetic_type: 'frame' },
        { id: 'b', cosmetic_type: 'frame', min_client_contract_version: 2 },
      ],
      error: null,
    },
    { data: [{ cosmetic_id: 'a' }], error: null },
    1,
  );
  assertEquals(result.items.length, 1);
  assertEquals(result.items[0].owned, true);
});
for (const source of ['catalog', 'ownership'])
  Deno.test(`${source} read errors fail explicitly`, async () => {
    await assertRejects(async () =>
      catalogFromReads(
        { data: [], error: source === 'catalog' ? {} : null },
        { data: [], error: source === 'ownership' ? {} : null },
        2,
      ),
    );
  });
Deno.test('committed purchase survives failed refresh', async () => {
  const response = await purchaseResponse(
    { success: true },
    'frame',
    async () => {
      throw new Error('offline');
    },
  );
  assertEquals(response.success, true);
  assertEquals(response.cosmetic_slug, 'frame');
  assertEquals(response.catalog_refresh_required, true);
  assertEquals(response.items, []);
});
Deno.test(
  'retry reconciles already-owned without claiming a new spend',
  async () => {
    const response = await purchaseResponse(
      { success: false, error: 'already_owned' },
      'frame',
      async () => ({ items: [], owned_count: 1 }),
    );
    assertEquals(response.success, true);
    assertEquals(response.already_owned, true);
    assertEquals(response.cosmetic_slug, 'frame');
  },
);
Deno.test('failed purchase remains failure when refresh fails', async () => {
  const response = await purchaseResponse(
    { success: false, error: 'insufficient_credits' },
    'frame',
    async () => {
      throw new Error('offline');
    },
  );
  assertEquals(response.success, false);
  assertEquals(response.cosmetic_slug, undefined);
});
