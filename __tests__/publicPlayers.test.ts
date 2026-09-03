/**
 * The public-players read: one `.in()` per 100 ids, the identity columns, a
 * legacy-column retry for a lagging backend, and an empty map (never a throw)
 * when nothing can be read.
 */
import {
  PUBLIC_PLAYER_CHUNK,
  PUBLIC_PLAYER_COLUMNS,
  PUBLIC_PLAYER_LEGACY_COLUMNS,
  chunkIds,
  fetchPublicPlayers,
} from '@/utils/publicPlayers';
import { NO_COSMETICS } from '@/utils/cosmetics';
import { supabase } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = (supabase as unknown as { from: jest.Mock }).from;

interface Recorded {
  table: string;
  columns: string;
  filter: { column: string; ids: string[] } | null;
}

type Result = { data: unknown; error: unknown };

/**
 * A recording stand-in for the PostgREST builder. `results` are handed out in
 * call order, so a test can make the first (wide) read fail and the second
 * (legacy) read succeed.
 */
function installFakeSupabase(results: Result[]): Recorded[] {
  const recorded: Recorded[] = [];
  let call = 0;
  mockedFrom.mockImplementation((table: string) => {
    const rec: Recorded = { table, columns: '', filter: null };
    recorded.push(rec);
    const result = results[Math.min(call, results.length - 1)];
    call += 1;
    const builder = {
      select(columns: string) {
        rec.columns = columns;
        return builder;
      },
      in(column: string, ids: string[]) {
        rec.filter = { column, ids };
        return builder;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  });
  return recorded;
}

const ids = (n: number, prefix = 'p') =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

beforeEach(() => {
  mockedFrom.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('chunkIds', () => {
  it('splits into consecutive groups of at most the given size', () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkIds([], 2)).toEqual([]);
    expect(chunkIds([1], 100)).toEqual([[1]]);
  });
});

describe('fetchPublicPlayers', () => {
  it('asks nothing for an empty list', async () => {
    installFakeSupabase([{ data: [], error: null }]);
    const map = await fetchPublicPlayers([]);
    expect(map.size).toBe(0);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('selects the identity columns from the public view and maps each row', async () => {
    const recorded = installFakeSupabase([
      {
        data: [
          {
            profile_id: 'p1',
            cosmetic_config: null,
            archetype: 'titan',
            signature_color: '#EF4444',
          },
          {
            profile_id: 'p2',
            cosmetic_config: {},
            archetype: null,
            signature_color: '   ',
          },
        ],
        error: null,
      },
    ]);
    const map = await fetchPublicPlayers(['p1', 'p2', 'p1']);

    expect(recorded).toHaveLength(1);
    expect(recorded[0].table).toBe('public_player_cosmetics');
    expect(recorded[0].columns).toBe(PUBLIC_PLAYER_COLUMNS);
    expect(recorded[0].filter).toEqual({
      column: 'profile_id',
      ids: ['p1', 'p2'],
    });

    expect(map.get('p1')).toEqual({
      archetype: 'titan',
      signatureColor: '#EF4444',
      cosmetics: NO_COSMETICS,
    });
    // Unknown identity is null, never an empty string, so callers fall back
    // to the neutral illustration.
    expect(map.get('p2')).toEqual({
      archetype: null,
      signatureColor: null,
      cosmetics: NO_COSMETICS,
    });
  });

  it('chunks ids in hundreds, one query per chunk', async () => {
    const recorded = installFakeSupabase([{ data: [], error: null }]);
    await fetchPublicPlayers(ids(PUBLIC_PLAYER_CHUNK + 50));

    expect(recorded).toHaveLength(2);
    expect(recorded[0].filter?.ids).toHaveLength(PUBLIC_PLAYER_CHUNK);
    expect(recorded[1].filter?.ids).toHaveLength(50);
    expect(recorded[1].filter?.ids[0]).toBe(`p${PUBLIC_PLAYER_CHUNK + 1}`);
  });

  it('retries with the legacy columns when the identity columns are not there yet', async () => {
    const recorded = installFakeSupabase([
      {
        data: null,
        error: { code: '42703', message: 'column archetype does not exist' },
      },
      { data: [{ profile_id: 'p1', cosmetic_config: null }], error: null },
    ]);
    const map = await fetchPublicPlayers(['p1']);

    expect(recorded).toHaveLength(2);
    expect(recorded[0].columns).toBe(PUBLIC_PLAYER_COLUMNS);
    expect(recorded[1].columns).toBe(PUBLIC_PLAYER_LEGACY_COLUMNS);
    expect(map.get('p1')).toEqual({
      archetype: null,
      signatureColor: null,
      cosmetics: NO_COSMETICS,
    });
  });

  it('resolves to an empty map when both reads fail', async () => {
    installFakeSupabase([{ data: null, error: { message: 'nope' } }]);
    const map = await fetchPublicPlayers(['p1', 'p2']);
    expect(map.size).toBe(0);
  });

  it('resolves to an empty map when the client throws', async () => {
    mockedFrom.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(fetchPublicPlayers(['p1'])).resolves.toEqual(new Map());
  });
});
