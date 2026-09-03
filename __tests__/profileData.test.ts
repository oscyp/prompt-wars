/**
 * The Profile tab's reads: the right table, the right filters, the right
 * limit — and a `null` (never a throw, never a false fact) when a read fails.
 */
import {
  ACTIVE_CHARACTER_COLUMNS,
  RIVAL_BATTLE_COLUMNS,
  RIVAL_BATTLE_LIMIT,
  battlesWithRival,
  buildRivalViews,
  fetchActiveCharacter,
  fetchHasRatedBattle,
  fetchProfileRow,
  fetchRivalBattles,
  fetchSeasonRank,
  fetchSignatureItemName,
  clearSignatureItemNameCache,
} from '@/utils/profileData';
import { PUBLIC_PROFILE_COLUMNS } from '@/utils/profiles';
import { supabase } from '@/utils/supabase';
import { listSignatureItemsCatalog } from '@/utils/characters';

jest.mock('@/utils/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('@/utils/characters', () => ({
  listSignatureItemsCatalog: jest.fn(),
}));

const mockedFrom = (supabase as unknown as { from: jest.Mock }).from;
const mockedCatalog = listSignatureItemsCatalog as jest.Mock;

type Call = [string, unknown[]];

interface FakeQuery {
  calls: Call[];
  [method: string]: unknown;
}

/**
 * A recording stand-in for the PostgREST builder: every filter method logs
 * its arguments and returns the builder; awaiting it (or `.single()` /
 * `.maybeSingle()`) resolves to the configured `{ data, error }`.
 */
function fakeQuery(result: { data: unknown; error: unknown }): FakeQuery {
  const calls: Call[] = [];
  const q: FakeQuery = { calls };
  for (const m of ['select', 'eq', 'or', 'in', 'order', 'limit', 'gte']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return q;
    };
  }
  q.single = () => {
    calls.push(['single', []]);
    return Promise.resolve(result);
  };
  q.maybeSingle = () => {
    calls.push(['maybeSingle', []]);
    return Promise.resolve(result);
  };
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
const RIVAL_A = '22222222-2222-4222-8222-222222222222';
const RIVAL_B = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchProfileRow', () => {
  it('reads the public columns of my own row', async () => {
    const q = fakeQuery({ data: { id: ME, username: 'me' }, error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchProfileRow(ME)).resolves.toEqual({
      id: ME,
      username: 'me',
    });
    expect(mockedFrom).toHaveBeenCalledWith('profiles');
    expect(has(q, ['select', [PUBLIC_PROFILE_COLUMNS]])).toBe(true);
    expect(has(q, ['eq', ['id', ME]])).toBe(true);
    expect(has(q, ['single', []])).toBe(true);
  });

  it('is null on a query error and on a thrown client', async () => {
    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchProfileRow(ME)).resolves.toBeNull();
    mockedFrom.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(fetchProfileRow(ME)).resolves.toBeNull();
  });
});

describe('fetchActiveCharacter', () => {
  it('reads the active character with every hero column', async () => {
    const q = fakeQuery({ data: { id: 'c1', name: 'Nyx' }, error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchActiveCharacter(ME)).resolves.toEqual({
      id: 'c1',
      name: 'Nyx',
    });
    expect(mockedFrom).toHaveBeenCalledWith('characters');
    expect(has(q, ['select', [ACTIVE_CHARACTER_COLUMNS]])).toBe(true);
    expect(has(q, ['eq', ['profile_id', ME]])).toBe(true);
    expect(has(q, ['eq', ['is_active', true]])).toBe(true);
    expect(has(q, ['maybeSingle', []])).toBe(true);
    for (const col of [
      'name',
      'archetype',
      'battle_cry',
      'signature_color',
      'signature_item_id',
      'stat_strength',
      'stat_stamina',
      'stat_agility',
      'stat_focus',
      'portrait_id',
      'avatar_portrait_id',
      'cosmetic_config',
    ]) {
      expect(ACTIVE_CHARACTER_COLUMNS).toContain(col);
    }
  });

  it('is null when there is no active character or the read fails', async () => {
    mockedFrom.mockReturnValue(fakeQuery({ data: null, error: null }));
    await expect(fetchActiveCharacter(ME)).resolves.toBeNull();
    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchActiveCharacter(ME)).resolves.toBeNull();
  });
});

describe('fetchHasRatedBattle', () => {
  it('asks for one completed ranked human battle on either side', async () => {
    const q = fakeQuery({ data: [{ id: 'b1' }], error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchHasRatedBattle(ME)).resolves.toBe(true);
    expect(mockedFrom).toHaveBeenCalledWith('battles');
    expect(
      has(q, ['or', [`player_one_id.eq.${ME},player_two_id.eq.${ME}`]]),
    ).toBe(true);
    expect(has(q, ['eq', ['mode', 'ranked']])).toBe(true);
    expect(has(q, ['eq', ['status', 'completed']])).toBe(true);
    expect(has(q, ['eq', ['is_player_two_bot', false]])).toBe(true);
    expect(has(q, ['limit', [1]])).toBe(true);
  });

  it('is false with no rows and null when the read fails', async () => {
    mockedFrom.mockReturnValue(fakeQuery({ data: [], error: null }));
    await expect(fetchHasRatedBattle(ME)).resolves.toBe(false);
    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchHasRatedBattle(ME)).resolves.toBeNull();
  });
});

describe('fetchSeasonRank', () => {
  const season = {
    id: 's1',
    name: 'Season 1',
    ends_at: '2026-10-01T00:00:00Z',
  };

  it('reads the active season, then my row in that season', async () => {
    const seasons = fakeQuery({ data: season, error: null });
    const rankings = fakeQuery({ data: { rank: 7 }, error: null });
    mockedFrom.mockImplementation((table: string) =>
      table === 'seasons' ? seasons : rankings,
    );
    await expect(fetchSeasonRank(ME)).resolves.toEqual({
      rank: 7,
      seasonName: 'Season 1',
      endsAt: '2026-10-01T00:00:00Z',
    });
    expect(has(seasons, ['select', ['id, name, ends_at']])).toBe(true);
    expect(has(seasons, ['eq', ['is_active', true]])).toBe(true);
    expect(has(rankings, ['eq', ['profile_id', ME]])).toBe(true);
    expect(has(rankings, ['eq', ['season_id', 's1']])).toBe(true);
    expect(has(rankings, ['maybeSingle', []])).toBe(true);
  });

  it('keeps the season but a null rank when I have no row', async () => {
    mockedFrom.mockImplementation((table: string) =>
      table === 'seasons'
        ? fakeQuery({ data: season, error: null })
        : fakeQuery({ data: null, error: null }),
    );
    await expect(fetchSeasonRank(ME)).resolves.toEqual({
      rank: null,
      seasonName: 'Season 1',
      endsAt: '2026-10-01T00:00:00Z',
    });
  });

  it('is an empty view without an active season and null when a read fails', async () => {
    mockedFrom.mockReturnValue(fakeQuery({ data: null, error: null }));
    await expect(fetchSeasonRank(ME)).resolves.toEqual({
      rank: null,
      seasonName: null,
      endsAt: null,
    });

    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchSeasonRank(ME)).resolves.toBeNull();

    mockedFrom.mockImplementation((table: string) =>
      table === 'seasons'
        ? fakeQuery({ data: season, error: null })
        : fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchSeasonRank(ME)).resolves.toBeNull();
  });
});

describe('fetchRivalBattles', () => {
  it('reads completed battles between me and any rival, newest first, capped', async () => {
    const rows = [{ status: 'completed', winner_id: ME }];
    const q = fakeQuery({ data: rows, error: null });
    mockedFrom.mockReturnValue(q);
    await expect(fetchRivalBattles(ME, [RIVAL_A, RIVAL_B])).resolves.toEqual(
      rows,
    );
    expect(mockedFrom).toHaveBeenCalledWith('battles');
    expect(has(q, ['select', [RIVAL_BATTLE_COLUMNS]])).toBe(true);
    expect(has(q, ['eq', ['status', 'completed']])).toBe(true);
    expect(
      has(q, ['or', [`player_one_id.eq.${ME},player_two_id.eq.${ME}`]]),
    ).toBe(true);
    expect(
      has(q, [
        'or',
        [
          `player_one_id.in.(${RIVAL_A},${RIVAL_B}),player_two_id.in.(${RIVAL_A},${RIVAL_B})`,
        ],
      ]),
    ).toBe(true);
    expect(has(q, ['order', ['created_at', { ascending: false }]])).toBe(true);
    expect(has(q, ['limit', [RIVAL_BATTLE_LIMIT]])).toBe(true);
    expect(RIVAL_BATTLE_LIMIT).toBe(100);
    for (const col of [
      'status',
      'winner_id',
      'is_draw',
      'player_one_id',
      'player_two_id',
      'created_at',
      'tier0_reveal_payload',
    ]) {
      expect(RIVAL_BATTLE_COLUMNS).toContain(col);
    }
  });

  it('does not query without rivals and drops ids that are not uuids', async () => {
    await expect(fetchRivalBattles(ME, [])).resolves.toEqual([]);
    await expect(fetchRivalBattles(ME, ['not-a-uuid'])).resolves.toEqual([]);
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('is null when the read fails', async () => {
    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchRivalBattles(ME, [RIVAL_A])).resolves.toBeNull();
  });
});

describe('fetchSignatureItemName', () => {
  beforeEach(() => clearSignatureItemNameCache());

  it('finds the equipped item in the catalog, custom items included', async () => {
    mockedCatalog.mockResolvedValue([
      { id: 'i1', name: 'Brass compass' },
      { id: 'i2', name: 'My own thing', isCustom: true },
    ]);
    await expect(fetchSignatureItemName('i2')).resolves.toBe('My own thing');
    await expect(fetchSignatureItemName('i1')).resolves.toBe('Brass compass');
  });

  it('is null when unset, unknown or the catalog call throws', async () => {
    await expect(fetchSignatureItemName(null)).resolves.toBeNull();
    await expect(fetchSignatureItemName(undefined)).resolves.toBeNull();
    expect(mockedCatalog).not.toHaveBeenCalled();

    mockedCatalog.mockResolvedValue([{ id: 'i1', name: 'Brass compass' }]);
    await expect(fetchSignatureItemName('nope')).resolves.toBeNull();

    mockedCatalog.mockRejectedValue(new Error('offline'));
    await expect(fetchSignatureItemName('i1')).resolves.toBeNull();
  });

  it('remembers a resolved name for the session, so refocusing the tab does not call the catalogue again', async () => {
    const mocked = listSignatureItemsCatalog as jest.Mock;
    mocked.mockResolvedValueOnce([{ id: 'i9', name: 'Iron kettle' }]);
    await expect(fetchSignatureItemName('i9')).resolves.toBe('Iron kettle');
    const calls = mocked.mock.calls.length;
    await expect(fetchSignatureItemName('i9')).resolves.toBe('Iron kettle');
    expect(mocked.mock.calls.length).toBe(calls);
  });
});

describe('buildRivalViews', () => {
  const battles = [
    {
      status: 'completed',
      winner_id: ME,
      is_draw: false,
      player_one_id: ME,
      player_two_id: RIVAL_A,
      created_at: '2026-09-01T10:00:00Z',
      tier0_reveal_payload: {
        players: {
          player_two: {
            character_name: 'Vex',
            archetype: 'trickster',
            signature_color: '#F59E0B',
          },
        },
      },
    },
    {
      status: 'completed',
      winner_id: RIVAL_A,
      is_draw: false,
      player_one_id: RIVAL_A,
      player_two_id: ME,
      created_at: '2026-08-30T10:00:00Z',
      tier0_reveal_payload: null,
    },
    {
      status: 'completed',
      winner_id: RIVAL_B,
      is_draw: false,
      player_one_id: ME,
      player_two_id: RIVAL_B,
      created_at: '2026-08-29T10:00:00Z',
      tier0_reveal_payload: null,
    },
  ];
  const rivals = [
    {
      rivalProfileId: RIVAL_A,
      displayName: 'vex_player',
      username: 'vex_player',
      battlesCount: 2,
      lastBattleAt: null,
    },
    {
      rivalProfileId: RIVAL_B,
      displayName: 'Bram',
      username: 'bram',
      battlesCount: 1,
      lastBattleAt: null,
    },
  ];

  it('splits battles per rival', () => {
    expect(battlesWithRival(battles, RIVAL_A)).toHaveLength(2);
    expect(battlesWithRival(battles, RIVAL_B)).toHaveLength(1);
    expect(battlesWithRival(battles, 'nobody')).toHaveLength(0);
  });

  it('pairs each rival with their record and payload identity', () => {
    const views = buildRivalViews(rivals, battles, ME);
    expect(views).toHaveLength(2);
    expect(views[0].summary.rivalProfileId).toBe(RIVAL_A);
    expect(views[0].record).toEqual({ wins: 1, losses: 1, draws: 0, total: 2 });
    expect(views[0].identity).toEqual({
      name: 'Vex',
      archetype: 'trickster',
      signatureColor: '#F59E0B',
    });
    expect(views[1].record).toEqual({ wins: 0, losses: 1, draws: 0, total: 1 });
    expect(views[1].identity).toEqual({
      name: null,
      archetype: null,
      signatureColor: null,
    });
  });
});
