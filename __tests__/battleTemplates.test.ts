/**
 * getBattleTemplates contract tests: normalization of the
 * `get_battle_templates` RPC payload and the null-return failure mode that
 * lets prompt-entry fall back to the generic template list.
 */
import { getBattleTemplates } from '@/utils/battles';
import { supabase } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  supabase: { rpc: jest.fn() },
  invokeAuthenticatedFunction: jest.fn(),
}));

const rpc = supabase.rpc as jest.Mock;

describe('getBattleTemplates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('calls the RPC with the battle id and maps rows', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 't1',
          title: 'Blitz',
          body: 'Strike first.',
          category: 'aggressive',
          suggested_move_type: 'attack',
        },
      ],
      error: null,
    });

    const result = await getBattleTemplates('battle-1');

    expect(rpc).toHaveBeenCalledWith('get_battle_templates', {
      p_battle_id: 'battle-1',
    });
    expect(result).toEqual([
      {
        id: 't1',
        title: 'Blitz',
        body: 'Strike first.',
        category: 'aggressive',
        suggested_move_type: 'attack',
      },
    ]);
  });

  it('normalizes unknown move types and null categories', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: 't1',
          title: 'Odd',
          body: 'Body',
          category: null,
          suggested_move_type: 'ultimate', // not a valid MoveType
        },
      ],
      error: null,
    });

    const result = await getBattleTemplates('battle-1');
    expect(result).toEqual([
      {
        id: 't1',
        title: 'Odd',
        body: 'Body',
        category: null,
        suggested_move_type: null,
      },
    ]);
  });

  it('caps the result at 3 templates', async () => {
    rpc.mockResolvedValueOnce({
      data: [1, 2, 3, 4, 5].map((n) => ({
        id: `t${n}`,
        title: `T${n}`,
        body: 'b',
        category: 'c',
        suggested_move_type: 'defense',
      })),
      error: null,
    });

    const result = await getBattleTemplates('battle-1');
    expect(result).toHaveLength(3);
  });

  it.each([
    ['RPC error', { data: null, error: { message: 'missing function' } }],
    ['empty array', { data: [], error: null }],
    ['non-array data', { data: { rows: [] }, error: null }],
  ])('returns null on %s so callers can fall back', async (_label, payload) => {
    rpc.mockResolvedValueOnce(payload);
    await expect(getBattleTemplates('battle-1')).resolves.toBeNull();
  });

  it('returns null when the RPC throws', async () => {
    rpc.mockRejectedValueOnce(new Error('network down'));
    await expect(getBattleTemplates('battle-1')).resolves.toBeNull();
  });
});
