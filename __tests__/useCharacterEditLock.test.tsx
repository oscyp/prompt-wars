import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCharacterEditLock } from '@/hooks/useCharacterEditLock';
import { supabase } from '@/utils/supabase';

let mockRows: unknown[] = [];
let mockRealtimeCallback: (() => void) | undefined;
const mockChannel = { id: 'edit-lock-channel' };

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(callback, [callback]);
  },
}));

function mockBattleQuery() {
  const builder: any = {
    select: () => builder,
    or: () => builder,
    not: () => builder,
    order: () => Promise.resolve({ data: mockRows, error: null }),
  };
  return builder;
}

jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'me' } } })),
    },
    from: jest.fn(() => mockBattleQuery()),
    channel: jest.fn(() => ({
      on: jest.fn((_type: string, _filter: unknown, callback: () => void) => {
        mockRealtimeCallback = callback;
        return {
          subscribe: jest.fn(() => mockChannel),
        };
      }),
    })),
    removeChannel: jest.fn(),
  },
}));

const mockedSupabase = supabase as unknown as {
  from: jest.Mock;
  removeChannel: jest.Mock;
};

describe('useCharacterEditLock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRealtimeCallback = undefined;
    mockRows = [
      {
        id: 'older',
        status: 'matched',
        player_one_id: 'me',
        player_one_character_id: 'fighter-1',
        current_round: 1,
        created_at: '2026-09-04T10:00:00Z',
        rounds: [],
      },
      {
        id: 'your-turn',
        status: 'waiting_for_prompts',
        player_one_id: 'me',
        player_one_character_id: 'fighter-1',
        current_round: 2,
        created_at: '2026-09-04T09:00:00Z',
        rounds: [],
      },
    ];
  });

  it('returns the active count and prioritizes the actionable resume route', async () => {
    const { result } = renderHook(() => useCharacterEditLock('fighter-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locked).toBe(true);
    expect(result.current.activeBattleCount).toBe(2);
    expect(result.current.primaryBattleRoute).toBe(
      '/(battle)/move-select?battleId=your-turn&round=2',
    );
  });

  it('unlocks after a realtime battle change and refetch', async () => {
    const { result } = renderHook(() => useCharacterEditLock('fighter-1'));
    await waitFor(() => expect(result.current.activeBattleCount).toBe(2));

    mockRows = [];
    await act(async () => {
      mockRealtimeCallback?.();
    });

    await waitFor(() => expect(result.current.locked).toBe(false));
    expect(result.current.activeBattleCount).toBe(0);
    expect(result.current.primaryBattleRoute).toBeNull();
    expect(mockedSupabase.from).toHaveBeenCalledWith('battles');
  });
});
