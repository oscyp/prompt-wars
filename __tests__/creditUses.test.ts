/**
 * "What credits buy": every label a player reads, the ordering, and a read
 * that fails as `null` rather than as an empty price list.
 */
import {
  CREDIT_PRICE_COLUMNS,
  CREDIT_USES_TITLE,
  CREDIT_USE_LABELS,
  PRICES_UNAVAILABLE,
  VIDEO_PRICE_NOTE,
  creditUses,
  fetchCreditPrices,
} from '@/utils/creditUses';
import { supabase } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockedFrom = (supabase as unknown as { from: jest.Mock }).from;

const LIVE_PRICES = {
  prices: {
    render_look: { credits: 3, cooldownSeconds: 0 },
    random_character: { credits: 5, cooldownSeconds: 0 },
    custom_item_image: { credits: 3, cooldownSeconds: 0 },
    custom_item_text: { credits: 1, cooldownSeconds: 0 },
    prompt_suggestions_reroll: { credits: 1, cooldownSeconds: 0 },
    leave_battle: { credits: 2, cooldownSeconds: 0 },
    regenerate_avatar: { credits: 1, cooldownSeconds: 0 },
    regenerate_portrait: { credits: 1, cooldownSeconds: 0 },
    rename: { credits: 0, cooldownSeconds: 86400 },
    battle_cry: { credits: 0, cooldownSeconds: 0 },
    avatar_retry: { credits: 0, cooldownSeconds: 0 },
    some_future_key: { credits: 9, cooldownSeconds: 0 },
  },
};

describe('creditUses', () => {
  it('lists labelled, priced actions cheapest first, alphabetical within a price', () => {
    expect(
      creditUses(LIVE_PRICES).map((u) => `${u.label} · ${u.credits}`),
    ).toEqual([
      'Custom item · 1',
      'New move suggestions · 1',
      'Redraw the avatar · 1',
      'Redraw the portrait · 1',
      'Leave a battle after locking in · 2',
      'Custom item with icon · 3',
      'Draw a new look · 3',
      'Random character · 5',
    ]);
  });

  it('skips free, unknown and malformed prices', () => {
    const keys = creditUses(LIVE_PRICES).map((u) => u.key);
    expect(keys).not.toContain('rename');
    expect(keys).not.toContain('avatar_retry');
    expect(keys).not.toContain('some_future_key');
    expect(
      creditUses({
        prices: {
          render_look: { credits: Number.NaN },
          leave_battle: undefined,
        },
      }),
    ).toEqual([]);
  });

  it('is empty without a price table', () => {
    expect(creditUses(null)).toEqual([]);
    expect(creditUses(undefined)).toEqual([]);
    expect(creditUses({ prices: {} })).toEqual([]);
  });

  it('pins the labels and the card copy', () => {
    expect(CREDIT_USE_LABELS).toEqual({
      render_look: 'Draw a new look',
      random_character: 'Random character',
      custom_item_image: 'Custom item with icon',
      custom_item_text: 'Custom item',
      prompt_suggestions_reroll: 'New move suggestions',
      leave_battle: 'Leave a battle after locking in',
      regenerate_avatar: 'Redraw the avatar',
      regenerate_portrait: 'Redraw the portrait',
    });
    expect(CREDIT_USES_TITLE).toBe('What credits buy');
    expect(VIDEO_PRICE_NOTE).toBe(
      'Cinematic videos: the price is shown before you buy.',
    );
    expect(PRICES_UNAVAILABLE).toBe('Prices unavailable right now.');
  });
});

describe('fetchCreditPrices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function fakeQuery(result: { data: unknown; error: unknown }) {
    const calls: [string, unknown[]][] = [];
    return {
      calls,
      select: (...args: unknown[]) => {
        calls.push(['select', args]);
        return Promise.resolve(result);
      },
    };
  }

  it('reads the whole price table and keys it by edit kind', async () => {
    const q = fakeQuery({
      data: [
        { edit_kind: 'render_look', credits: 3 },
        { edit_kind: 'leave_battle', credits: '2' },
        { edit_kind: 'rename', credits: null },
      ],
      error: null,
    });
    mockedFrom.mockReturnValue(q);
    await expect(fetchCreditPrices()).resolves.toEqual({
      prices: {
        render_look: { credits: 3 },
        leave_battle: { credits: 2 },
        rename: { credits: 0 },
      },
    });
    expect(mockedFrom).toHaveBeenCalledWith('character_edit_prices');
    expect(q.calls).toEqual([['select', [CREDIT_PRICE_COLUMNS]]]);
  });

  it('is null on a query error and on a thrown client', async () => {
    mockedFrom.mockReturnValue(
      fakeQuery({ data: null, error: { message: 'x' } }),
    );
    await expect(fetchCreditPrices()).resolves.toBeNull();
    mockedFrom.mockImplementation(() => {
      throw new Error('offline');
    });
    await expect(fetchCreditPrices()).resolves.toBeNull();
  });
});
