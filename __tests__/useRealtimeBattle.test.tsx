import { renderHook, waitFor } from '@testing-library/react-native';
import { useRealtimeBattle } from '@/hooks/useRealtimeBattle';
import { supabase } from '@/utils/supabase';

/**
 * Mirrors @supabase/realtime-js: `client.channel(topic)` hands back the
 * *existing* channel for a topic already registered on the client, and
 * `channel.on('postgres_changes', ...)` throws once that channel has joined.
 * Two screens of the same battle are mounted at once (move-select pushes
 * prompt-entry), so the hook must not reuse a topic across instances.
 */
const channels: FakeChannel[] = [];

class FakeChannel {
  joined = false;
  constructor(public topic: string) {}

  on(type: string) {
    if (this.joined && type === 'postgres_changes') {
      throw new Error(
        `cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`,
      );
    }
    return this;
  }

  subscribe(cb?: (status: string) => void) {
    this.joined = true;
    cb?.('SUBSCRIBED');
    return this;
  }
}

function queryResult(data: unknown) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve({ data, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
  };
  return builder;
}

jest.mock('@/utils/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
    from: jest.fn(),
  },
}));

const mockedSupabase = supabase as unknown as {
  channel: jest.Mock;
  removeChannel: jest.Mock;
  from: jest.Mock;
};

const BATTLE_ID = '4351d020-3af6-409e-a2e6-59d7f359b0c3';

describe('useRealtimeBattle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    channels.length = 0;
    mockedSupabase.channel.mockImplementation((topic: string) => {
      const existing = channels.find((c) => c.topic === topic);
      if (existing) return existing;
      const created = new FakeChannel(topic);
      channels.push(created);
      return created;
    });
    mockedSupabase.removeChannel.mockImplementation(
      async (channel: FakeChannel) => {
        const idx = channels.indexOf(channel);
        if (idx >= 0) channels.splice(idx, 1);
        return 'ok';
      },
    );
    mockedSupabase.from.mockImplementation((table: string) => {
      if (table === 'battles') {
        return queryResult({ id: BATTLE_ID, status: 'in_progress' });
      }
      return queryResult([]);
    });
  });

  it('subscribes to the battle', async () => {
    const { result } = renderHook(() => useRealtimeBattle(BATTLE_ID));
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(channels).toHaveLength(1);
  });

  it('does not reuse a joined channel when a second screen mounts', async () => {
    const first = renderHook(() => useRealtimeBattle(BATTLE_ID));
    await waitFor(() => expect(first.result.current.isSubscribed).toBe(true));

    // move-select stays mounted while prompt-entry pushes on top of it.
    const second = renderHook(() => useRealtimeBattle(BATTLE_ID));
    await waitFor(() => expect(second.result.current.isSubscribed).toBe(true));

    expect(channels).toHaveLength(2);
    expect(channels[0].topic).not.toBe(channels[1].topic);
  });

  it('removes its own channel on unmount', async () => {
    const { result, unmount } = renderHook(() => useRealtimeBattle(BATTLE_ID));
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    unmount();
    expect(mockedSupabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(0);
  });
});
