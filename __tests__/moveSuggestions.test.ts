/**
 * The suggestion READ path.
 *
 * The property under test is a money property, not a display one: a set that
 * is still being generated must never be read as "no set", because the screen
 * answers "no set" by calling the generate endpoint -- which lands on an
 * already-claimed free slot, 23505s, and bills the player a credit for a set
 * that was already on its way to them.
 */
import {
  classifySuggestionFailure,
  getMoveSuggestions,
  readMoveSuggestions,
  getOpponentMoveHistory,
} from '@/utils/battles';
import { supabase } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  invokeAuthenticatedFunction: jest.fn(),
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

type Row = {
  suggestions?: unknown;
  moderation_status?: string | null;
  move_type?: string | null;
  created_at?: string;
};

function mockRows(rows: Row[], error: { message: string } | null = null) {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => Promise.resolve({ data: error ? null : rows, error }),
    };
    return query;
  });
}

const READY: Row = {
  move_type: 'attack',
  moderation_status: 'approved',
  suggestions: [{ title: 'Ember feint', body: 'A body long enough to pass.' }],
};

describe('readMoveSuggestions', () => {
  it('returns a ready set for an approved row', async () => {
    mockRows([READY]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack).toEqual({
      status: 'ready',
      suggestions: READY.suggestions,
    });
  });

  it('surfaces a flagged-for-review set (it is still shown today)', async () => {
    mockRows([{ ...READY, moderation_status: 'flagged_human_review' }]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack.status).toBe('ready');
  });

  it('reports a placeholder row as pending, NOT as empty', async () => {
    // This is the whole point of the tri-state. Reading this as `none` is what
    // charges the player for a set that is already being generated.
    mockRows([
      {
        move_type: 'attack',
        moderation_status: 'pending',
        suggestions: [
          { title: 'Opening move', body: 'Describe how your fighter opens…' },
        ],
      },
    ]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack).toEqual({ status: 'pending' });
  });

  it('never surfaces the slot placeholder as a real suggestion', async () => {
    // The placeholder is a valid-looking prompt on purpose (older builds that
    // predate this filter render it, so it must be harmless if submitted).
    // That makes it MORE important that clients which can tell the difference
    // hide it: it is not an idea written for this fighter.
    mockRows([
      {
        move_type: 'attack',
        moderation_status: 'pending',
        suggestions: [
          {
            title: 'Opening move',
            body: 'Describe how your fighter opens the exchange, using their signature item and the arena around them.',
          },
        ],
      },
    ]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack).toEqual({ status: 'pending' });
    expect(JSON.stringify(all)).not.toContain('Opening move');
  });

  it('treats a rejected set as empty so it cannot resurface', async () => {
    mockRows([{ ...READY, moderation_status: 'rejected' }]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack).toEqual({ status: 'none' });
  });

  it('treats an unknown moderation status as not showable', async () => {
    // Allow-list, not deny-list: a status added to the enum later must default
    // to hidden rather than silently reaching a player.
    mockRows([{ ...READY, moderation_status: 'quarantined_pending_appeal' }]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack).toEqual({ status: 'none' });
  });

  it('returns every move type from one query', async () => {
    mockRows([
      READY,
      { ...READY, move_type: 'defense' },
      { ...READY, move_type: 'finisher', moderation_status: 'pending' },
    ]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack.status).toBe('ready');
    expect(all.defense.status).toBe('ready');
    expect(all.finisher.status).toBe('pending');
  });

  it('reports move types with no row at all as none', async () => {
    mockRows([READY]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.defense).toEqual({ status: 'none' });
    expect(all.finisher).toEqual({ status: 'none' });
  });

  it('keeps the newest row and ignores the superseded one', async () => {
    // Rows arrive newest-first; an older reroll behind the current set must
    // not win.
    mockRows([
      { ...READY, suggestions: [{ title: 'new', body: 'the current set' }] },
      { ...READY, suggestions: [{ title: 'old', body: 'a superseded set' }] },
    ]);
    const all = await readMoveSuggestions('battle', 1);
    expect(all.attack).toEqual({
      status: 'ready',
      suggestions: [{ title: 'new', body: 'the current set' }],
    });
  });

  it('THROWS on a query error rather than reporting an empty slot', async () => {
    // Returning `none` here would be indistinguishable from "nothing exists",
    // which sends the caller to the generate path -- so a network blip would
    // spend the free slot or a credit. The caller has a read-retry for this.
    mockRows([], { message: 'network down' });
    await expect(readMoveSuggestions('battle', 1)).rejects.toThrow(
      'network down',
    );
  });
});

describe('getMoveSuggestions', () => {
  it('projects one move type out of the combined read', async () => {
    mockRows([{ ...READY, move_type: 'defense' }]);
    expect((await getMoveSuggestions('battle', 'defense', 1)).status).toBe(
      'ready',
    );
    expect(await getMoveSuggestions('battle', 'attack', 1)).toEqual({
      status: 'none',
    });
  });
});

describe('classifySuggestionFailure', () => {
  // This function exists because the previous classifier matched on the error
  // MESSAGE while the function puts the reason in `code` -- so no paywall or
  // rate limit was ever recognised. Status and code are both authoritative.
  it('recognises the paywall from either the code or the status', () => {
    expect(classifySuggestionFailure(402, undefined)).toBe(
      'insufficient_credits',
    );
    expect(classifySuggestionFailure(500, 'insufficient_credits')).toBe(
      'insufficient_credits',
    );
  });

  it('recognises a rate limit from either the code or the status', () => {
    expect(classifySuggestionFailure(429, undefined)).toBe('rate_limited');
    expect(classifySuggestionFailure(500, 'rate_limited')).toBe('rate_limited');
  });

  it('never infers a wall from prose alone', () => {
    expect(classifySuggestionFailure(500, 'server_error')).toBe('unavailable');
    expect(classifySuggestionFailure(undefined, undefined)).toBe('unavailable');
  });
});

it('preserves the server historical oldest-to-newest order', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: { recent_moves: ['attack', 'finisher', 'defense'] }, error: null });
  expect(await getOpponentMoveHistory('battle')).toEqual([{ move_type: 'attack' }, { move_type: 'finisher' }, { move_type: 'defense' }]);
});
