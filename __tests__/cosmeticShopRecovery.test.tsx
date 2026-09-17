import { act, renderHook } from '@testing-library/react-native';
import { useCosmeticShop } from '@/hooks/useCosmeticShop';
import {
  listCosmetics,
  purchaseCosmetic,
  equipCosmetic,
} from '@/utils/cosmetics';
import { resolvePortraitImageUrl } from '@/utils/characters';
import { supabase } from '@/utils/supabase';

jest.mock('@/utils/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/utils/cosmetics', () => ({
  listCosmetics: jest.fn(),
  syncCosmetics: jest.fn(async () => null),
  purchaseCosmetic: jest.fn(),
  equipCosmetic: jest.fn(),
}));
jest.mock('@/utils/monetization', () => ({
  getWalletBalanceResult: jest.fn(async () => ({
    ok: true,
    balance: { credits_balance: 99, is_subscriber: false },
  })),
}));
jest.mock('@/constants/ArchetypeAvatars', () => ({
  archetypeIllustrationUri: () => 'bundled-strategist',
}));
jest.mock('@/utils/profileData', () => ({
  fetchProfileRow: jest.fn(async () => null),
}));
jest.mock('@/utils/characters', () => ({
  getPortraitFallbackUri: () => 'starter',
  resolveSignatureHex: () => '#123456',
  resolvePortraitImageUrl: jest.fn(async () => 'signed'),
}));
const item = {
  slug: 'gold_frame',
  name: 'Gold',
  cosmetic_type: 'frame',
  owned: false,
} as any;
const row = {
  id: 'fighter',
  name: 'Fighter',
  cosmetic_config: {},
  archetype: 'mage',
  signature_color: 'blue',
};
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  jest.clearAllMocks();
  (listCosmetics as jest.Mock).mockResolvedValue({
    success: true,
    items: [item],
  });
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  });
});
it('acknowledges ownership even when the purchase catalog and reconciliation fail', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  (purchaseCosmetic as jest.Mock).mockResolvedValue({
    success: true,
    items: [],
    catalog_refresh_required: true,
    cosmetic_slug: item.slug,
  });
  (listCosmetics as jest.Mock).mockResolvedValue(null);
  await act(async () => {
    await result.current.purchase(item);
  });
  expect(result.current.items).toEqual([{ ...item, owned: true }]);
  expect(result.current.error).toBeTruthy();
});
it('locks concurrent mutations synchronously and applies authoritative equip data', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  const pending = deferred();
  (equipCosmetic as jest.Mock).mockReturnValue(pending.promise);
  let first!: Promise<any>;
  act(() => {
    first = result.current.equip(item);
    void result.current.purchase(item);
  });
  expect(purchaseCosmetic).not.toHaveBeenCalled();
  await act(async () => {
    pending.resolve({
      success: true,
      cosmetic_config: { frame: 'gold_frame', title: 'warrior_title' },
    });
    await first;
  });
  expect(result.current.equipped).toEqual({
    frame: 'gold_frame',
    title: 'warrior_title',
  });
});
it('ignores older catalog reads', async () => {
  const old = deferred();
  (listCosmetics as jest.Mock)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue({ success: true, items: [{ ...item, owned: true }] });
  const { result } = renderHook(() => useCosmeticShop('user'));
  let first!: Promise<void>;
  await act(async () => {
    first = result.current.refresh();
    await Promise.resolve();
  });
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    old.resolve({ success: true, items: [item] });
    await first;
  });
  expect(result.current.items[0].owned).toBe(true);
});
it('discards a purchase result after the account changes', async () => {
  const { result, rerender } = renderHook<
    ReturnType<typeof useCosmeticShop>,
    { id: string }
  >(({ id }) => useCosmeticShop(id), { initialProps: { id: 'a' } });
  await act(async () => {
    await result.current.refresh();
  });
  const pending = deferred();
  (purchaseCosmetic as jest.Mock).mockReturnValue(pending.promise);
  let first!: Promise<any>;
  act(() => {
    first = result.current.purchase(item);
  });
  rerender({ id: 'b' });
  await act(async () => {
    pending.resolve({ success: true, items: [{ ...item, owned: true }] });
    await first;
  });
  expect(result.current.items).toEqual([]);
});
it('retains fighter on failed read but clears it on confirmed empty', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  const response = { data: null, error: { message: 'offline' } } as any;
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: async () => response }) }),
    }),
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.character?.name).toBe('Fighter');
  response.error = null;
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.character).toBeNull();
  expect(result.current.characterStatus).toBe('empty');
});

it('old account completion cannot release the new account mutation lock', async () => {
  const { result, rerender } = renderHook<
    ReturnType<typeof useCosmeticShop>,
    { id: string }
  >(({ id }) => useCosmeticShop(id), { initialProps: { id: 'a' } });
  await act(async () => {
    await result.current.refresh();
  });
  const old = deferred(),
    next = deferred();
  (purchaseCosmetic as jest.Mock)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(next.promise);
  let first!: Promise<any>, second!: Promise<any>;
  act(() => {
    first = result.current.purchase(item);
  });
  rerender({ id: 'b' });
  await act(async () => {
    await result.current.refresh();
  });
  act(() => {
    second = result.current.purchase(item);
  });
  await act(async () => {
    old.resolve({ success: true, items: [] });
    await first;
  });
  act(() => {
    void result.current.purchase(item);
  });
  expect(purchaseCosmetic).toHaveBeenCalledTimes(2);
  await act(async () => {
    next.resolve({ success: true, items: [] });
    await second;
  });
});
it('finishes a failed refresh even when a query builder throws', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  (supabase.from as jest.Mock).mockImplementation(() => {
    throw new Error('offline');
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.refreshing).toBe(false);
  expect(result.current.loading).toBe(false);
  expect(result.current.characterStatus).toBe('error');
});
it('a pre-mutation read cannot roll back acknowledged ownership', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  const pending = deferred();
  (listCosmetics as jest.Mock).mockReturnValueOnce(pending.promise);
  let old!: Promise<void>;
  await act(async () => {
    old = result.current.refresh();
    await Promise.resolve();
  });
  (purchaseCosmetic as jest.Mock).mockResolvedValue({
    success: true,
    items: [],
    catalog_refresh_required: true,
  });
  await act(async () => {
    await result.current.purchase(item);
  });
  await act(async () => {
    pending.resolve({ success: true, items: [item] });
    await old;
  });
  expect(result.current.items[0].owned).toBe(true);
});

it('preserves signed artwork for the same asset when re-signing fails', async () => {
  const fighter = {
    ...row,
    portrait_id: 'portrait',
    avatar_portrait_id: 'avatar',
  };
  (supabase.from as jest.Mock).mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: fighter, error: null }),
        }),
      }),
    }),
  });
  (resolvePortraitImageUrl as jest.Mock).mockImplementation(
    async (id) => `signed-${id}`,
  );
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  (resolvePortraitImageUrl as jest.Mock).mockRejectedValue(
    new Error('offline'),
  );
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.character?.portraitUri).toBe('signed-portrait');
  expect(result.current.character?.avatarUri).toBe('signed-avatar');
  expect(result.current.artworkError).toBe(true);
});
it('uses bundled starter art with no portrait instead of a silhouette', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.character?.portraitUri).toBe('bundled-strategist');
});

it.each(['portrait', 'avatar'])(
  'retains both contexts when the only %s asset fails re-signing',
  async (source) => {
    const fighter = {
      ...row,
      portrait_id: source === 'portrait' ? 'only' : null,
      avatar_portrait_id: source === 'avatar' ? 'only' : null,
    };
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: fighter, error: null }),
          }),
        }),
      }),
    });
    (resolvePortraitImageUrl as jest.Mock).mockResolvedValue('signed-only');
    const { result } = renderHook(() => useCosmeticShop('user'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.character?.portraitUri).toBe('signed-only');
    expect(result.current.character?.avatarUri).toBe('signed-only');
    (resolvePortraitImageUrl as jest.Mock).mockRejectedValue(
      new Error('offline'),
    );
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.character?.portraitUri).toBe('signed-only');
    expect(result.current.character?.avatarUri).toBe('signed-only');
    expect(result.current.artworkError).toBe(true);
    if (source === 'portrait') fighter.portrait_id = 'replacement';
    else fighter.avatar_portrait_id = 'replacement';
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.character?.portraitUri).toBe('bundled-strategist');
    expect(result.current.character?.avatarUri).toBe('bundled-strategist');
  },
);
it('failed mutation ends the refreshing state of the read it invalidated', async () => {
  const { result } = renderHook(() => useCosmeticShop('user'));
  await act(async () => {
    await result.current.refresh();
  });
  const pending = deferred();
  (listCosmetics as jest.Mock).mockReturnValueOnce(pending.promise);
  let old!: Promise<void>;
  await act(async () => {
    old = result.current.refresh();
    await Promise.resolve();
  });
  expect(result.current.refreshing).toBe(true);
  (equipCosmetic as jest.Mock).mockResolvedValue({
    success: false,
    error: 'offline',
  });
  await act(async () => {
    await result.current.equip(item);
  });
  await act(async () => {
    pending.resolve({ success: true, items: [item] });
    await old;
  });
  expect(result.current.refreshing).toBe(false);
  expect(result.current.busySlug).toBeNull();
});

it.each(['purchase', 'equip'] as const)(
  'keeps %s locked during delayed post-mutation refresh',
  async (kind) => {
    const { result } = renderHook(() => useCosmeticShop('user'));
    await act(async () => {
      await result.current.refresh();
    });
    const delayedCatalog = deferred();
    (listCosmetics as jest.Mock).mockReturnValueOnce(delayedCatalog.promise);
    (purchaseCosmetic as jest.Mock).mockResolvedValue({
      success: true,
      items: [],
      catalog_refresh_required: true,
    });
    (equipCosmetic as jest.Mock).mockResolvedValue({
      success: true,
      cosmetic_config: { frame: 'gold_frame' },
    });
    let operation!: Promise<any>;
    await act(async () => {
      operation = result.current[kind](item);
      await Promise.resolve();
    });
    expect(result.current.busySlug).toBe('gold_frame');
    if (kind === 'purchase') expect(result.current.items[0].owned).toBe(true);
    else expect(result.current.equipped.frame).toBe('gold_frame');
    await act(async () => {
      await result.current[kind](item);
    });
    expect(
      kind === 'purchase' ? purchaseCosmetic : equipCosmetic,
    ).toHaveBeenCalledTimes(1);
    await act(async () => {
      delayedCatalog.resolve({ success: true, items: [item] });
      await operation;
    });
    expect(result.current.busySlug).toBeNull();
    if (kind === 'purchase') expect(result.current.items[0].owned).toBe(true);
    else expect(result.current.equipped.frame).toBe('gold_frame');
  },
);
