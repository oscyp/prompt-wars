import { invokeFunctionResult } from '@/utils/supabase';
import {
  equipCosmetic,
  listCosmetics,
  purchaseCosmetic,
  syncCosmetics,
} from '@/utils/cosmetics';

jest.mock('@/utils/supabase', () => ({ invokeFunctionResult: jest.fn() }));
const invoke = jest.mocked(invokeFunctionResult);
beforeEach(() => invoke.mockReset());

it('advertises supported artwork on every catalog and mutation request', async () => {
  invoke.mockResolvedValue({
    data: { success: true, items: [], owned_count: 0 },
    error: null,
  });
  await listCosmetics();
  await syncCosmetics();
  await purchaseCosmetic('astral_codex_frame');
  await equipCosmetic('fighter', 'frame', null);
  expect(invoke.mock.calls.map(([, body]) => body)).toEqual([
    { action: 'list', client_contract_version: 2 },
    { action: 'sync', client_contract_version: 2 },
    {
      action: 'purchase',
      client_contract_version: 2,
      cosmetic_slug: 'astral_codex_frame',
    },
    {
      action: 'equip',
      client_contract_version: 2,
      character_id: 'fighter',
      cosmetic_type: 'frame',
      cosmetic_slug: null,
    },
  ]);
});

it('preserves the committed ownership acknowledgment when catalog refresh fails', async () => {
  const acknowledgment = {
    success: true,
    cosmetic_slug: 'astral_codex_frame',
    already_owned: true,
    items: [],
    owned_count: 0,
    catalog_refresh_required: true,
  };
  invoke.mockResolvedValue({ data: acknowledgment, error: null });
  expect(await purchaseCosmetic('astral_codex_frame')).toEqual(acknowledgment);
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('marks an empty purchase response for reconciliation instead of reporting success', async () => {
  invoke.mockResolvedValue({ data: null, error: null });
  expect(await purchaseCosmetic('astral_codex_frame')).toMatchObject({
    success: false,
    catalog_refresh_required: true,
  });
});

it('returns the server equipment configuration including other equipped slots', async () => {
  const acknowledgment = {
    success: true,
    equipped: 'neon_circuit_frame',
    type: 'frame',
    cosmetic_config: { frame: 'neon_circuit_frame', title: 'plus_title' },
  };
  invoke.mockResolvedValue({ data: acknowledgment, error: null });
  expect(await equipCosmetic('fighter', 'frame', 'neon_circuit_frame')).toEqual(
    acknowledgment,
  );
});
