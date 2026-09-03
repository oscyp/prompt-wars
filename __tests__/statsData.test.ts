/**
 * The Stats screen's reads: the right table, the right filters, chunked ids,
 * and a `null` (never a throw, never a false fact) when a read fails.
 */
import {
  MY_PROMPT_COLUMNS,
  MY_PROMPT_LIMIT,
  ROUND_BATTLE_CHUNK,
  ROUND_SCORE_COLUMNS,
  fetchMyPrompts,
  fetchRoundsForBattles,
} from '@/utils/statsData';
import { supabase } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = (supabase as unknown as { from: jest.Mock }).from;

type Call = [string, unknown[]];

interface FakeQuery {
  calls: Call[];
  [method: string]: unknown;
}

/** Records every builder call; awaiting resolves to the configured result. */
function fakeQuery(result: { data: unknown; error: unknown }): FakeQuery {
  const calls: Call[] = [];
  const q: FakeQuery = { calls };
  for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return q;
    };
  }
  q.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return q;
}

const has = (q: FakeQuery, call: Call) =>
  q.calls.some(
    ([m, args]) =>
      m === call[0] && JSON.stringify(args) === JSON.stringify(call[1]),
  );

const ME = '11111111-1111-4111-8111-111111111111';

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchMyPrompts', () => {
  it('reads my locked prompts, newest lock first, capped', async () => {
    const rows = [{ battle_id: uuid(1), round_number: 1, move_type: 'attack' }];
    const q = fakeQuery({ data: rows, error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchMyPrompts(ME)).resolves.toEqual(rows);
    expect(mockedFrom).toHaveBeenCalledWith('battle_prompts');
    expect(has(q, ['select', [MY_PROMPT_COLUMNS]])).toBe(true);
    expect(has(q, ['eq', ['profile_id', ME]])).toBe(true);
    expect(has(q, ['eq', ['is_locked', true]])).toBe(true);
    expect(has(q, ['order', ['locked_at', { ascending: false }]])).toBe(true);
    expect(has(q, ['limit', [MY_PROMPT_LIMIT]])).toBe(true);
    expect(MY_PROMPT_LIMIT).toBe(200);
    for (const col of [
      'battle_id',
      'round_number',
      'move_type',
      'custom_prompt_text',
    ]) {
      expect(MY_PROMPT_COLUMNS).toContain(col);
    }
  });

  it('passes a custom limit and returns [] for no rows', async () => {
    const q = fakeQuery({ data: null, error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchMyPrompts(ME, 25)).resolves.toEqual([]);
    expect(has(q, ['limit', [25]])).toBe(true);
  });

  it('is null on a query error and on a thrown client', async () => {
    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchMyPrompts(ME)).resolves.toBeNull();
    mockedFrom.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(fetchMyPrompts(ME)).resolves.toBeNull();
  });
});

describe('fetchRoundsForBattles', () => {
  it('reads the score columns for the given battles in one query when few', async () => {
    const rows = [{ battle_id: uuid(1), round_number: 1 }];
    const q = fakeQuery({ data: rows, error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchRoundsForBattles([uuid(1), uuid(2)])).resolves.toEqual(
      rows,
    );
    expect(mockedFrom).toHaveBeenCalledTimes(1);
    expect(mockedFrom).toHaveBeenCalledWith('battle_rounds');
    expect(has(q, ['select', [ROUND_SCORE_COLUMNS]])).toBe(true);
    expect(has(q, ['in', ['battle_id', [uuid(1), uuid(2)]]])).toBe(true);
    for (const col of [
      'battle_id',
      'round_number',
      'round_winner_id',
      'is_draw',
      'player_one_score',
      'player_two_score',
      'is_ko',
    ]) {
      expect(ROUND_SCORE_COLUMNS).toContain(col);
    }
  });

  it('dedupes ids, drops non-uuids, and does not query with nothing left', async () => {
    const q = fakeQuery({ data: [], error: null });
    mockedFrom.mockReturnValue(q);
    await fetchRoundsForBattles([uuid(1), uuid(1), 'not-a-uuid']);
    expect(has(q, ['in', ['battle_id', [uuid(1)]]])).toBe(true);

    mockedFrom.mockClear();
    await expect(fetchRoundsForBattles([])).resolves.toEqual([]);
    await expect(fetchRoundsForBattles(['junk'])).resolves.toEqual([]);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('chunks ids in hundreds and concatenates the rows', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(i + 1));
    const queries: FakeQuery[] = [];
    mockedFrom.mockImplementation(() => {
      const q = fakeQuery({
        data: [{ battle_id: `chunk-${queries.length}` }],
        error: null,
      });
      queries.push(q);
      return q;
    });
    const rows = await fetchRoundsForBattles(ids);
    expect(ROUND_BATTLE_CHUNK).toBe(100);
    expect(queries).toHaveLength(3);
    const sizes = queries.map(
      (q) => (q.calls.find(([m]) => m === 'in')?.[1][1] as string[]).length,
    );
    expect(sizes).toEqual([100, 100, 50]);
    expect(rows).toEqual([
      { battle_id: 'chunk-0' },
      { battle_id: 'chunk-1' },
      { battle_id: 'chunk-2' },
    ]);
  });

  it('is null when any chunk fails or the client throws', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => uuid(i + 1));
    let n = 0;
    mockedFrom.mockImplementation(() => {
      n += 1;
      return n === 2
        ? fakeQuery({ data: null, error: { message: 'x' } })
        : fakeQuery({ data: [{ battle_id: uuid(1) }], error: null });
    });
    await expect(fetchRoundsForBattles(ids)).resolves.toBeNull();

    mockedFrom.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(fetchRoundsForBattles([uuid(1)])).resolves.toBeNull();
  });
});
