import { PlayerAvatarCache } from '@/utils/playerAvatarCache';
const ref = (id: string) => ({ kind: 'players' as const, id });
const available = (asset = 'face', url = 'https://face') => ({
  status: 'available' as const,
  asset_id: asset,
  signed_url: url,
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
});
describe('player avatar cache', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('deduplicates overlapping requests and splits loaded pages at 50', async () => {
    const transport = jest.fn(async (_account, body) => ({
      players: Object.fromEntries(
        body.profile_ids.map((id: string) => [id, available()]),
      ),
      battles: {},
    }));
    const cache = new PlayerAvatarCache(transport);
    const first = cache.request(
      'a',
      Array.from({ length: 65 }, (_, i) => ref(String(i))),
    );
    const duplicate = cache.request('a', [ref('0')]);
    await jest.runAllTimersAsync();
    await Promise.all([first, duplicate]);
    expect(transport.mock.calls.map((c) => c[1].profile_ids.length)).toEqual([
      50, 15,
    ]);
    expect(cache.get('a', ref('0'))?.asset_id).toBe('face');
  });
  it('retains known artwork on refresh failure but clears authoritative removal', async () => {
    const transport = jest
      .fn()
      .mockResolvedValueOnce({ players: { p: available() } })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ players: { p: { status: 'unavailable' } } });
    const cache = new PlayerAvatarCache(transport);
    for (let i = 0; i < 3; i++) {
      const pending = cache.request('a', [ref('p')], true);
      await jest.runAllTimersAsync();
      await pending;
      expect(cache.get('a', ref('p'))?.signed_url).toBe(
        i < 2 ? 'https://face' : undefined,
      );
    }
  });
  it('old account responses cannot populate a new account or return old images', async () => {
    let resolve!: (v: {
      players: Record<string, ReturnType<typeof available>>;
    }) => void;
    const cache = new PlayerAvatarCache(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const pending = cache.request('a', [ref('p')]);
    jest.runOnlyPendingTimers();
    cache.setAccount('b');
    resolve({ players: { p: available() } });
    await pending;
    expect(cache.get('a', ref('p'))).toBeUndefined();
    expect(cache.get('b', ref('p'))).toBeUndefined();
  });
  it('uses identity contexts independently and refreshes before expiry', async () => {
    const transport = jest.fn(async () => ({
      players: { p: available('new') },
      battles: { p: available('old') },
    }));
    const cache = new PlayerAvatarCache(transport);
    const refs = [ref('p'), { kind: 'battles' as const, id: 'p' }];
    let pending = cache.request('a', refs);
    await jest.runAllTimersAsync();
    await pending;
    expect(cache.get('a', refs[0])?.asset_id).toBe('new');
    expect(cache.get('a', refs[1])?.asset_id).toBe('old');
    await cache.request('a', refs);
    expect(transport).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 56 * 60_000);
    pending = cache.request('a', refs);
    await jest.runAllTimersAsync();
    await pending;
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
