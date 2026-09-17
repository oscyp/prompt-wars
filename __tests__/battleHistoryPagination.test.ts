import {
  getFinishedBattlePage,
  activeBattleDeadline,
  groupBattlesForList,
} from '@/utils/battleLists';
import { supabase } from '@/utils/supabase';
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'me' } } })) },
    from: jest.fn(),
  },
}));
it('uses a stable timestamp and id cursor and does not let active rows consume history pages', async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({
    id: `id-${String(100 - i).padStart(3, '0')}`,
    created_at: '2026-09-13T10:00:00Z',
    status: 'completed',
    player_one_id: 'me',
  }));
  const query: any = {
    select: jest.fn(() => query),
    or: jest.fn(() => query),
    in: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(async () => ({ data: rows, error: null })),
  };
  (supabase.from as jest.Mock).mockReturnValue(query);
  const first = await getFinishedBattlePage();
  expect(first.items).toHaveLength(50);
  expect(first.nextCursor).toEqual({
    createdAt: rows[49].created_at,
    id: rows[49].id,
  });
  expect(query.in.mock.calls[0][1]).not.toContain('waiting_for_prompts');
  query.limit.mockResolvedValue({ data: [rows[50]], error: null });
  const next = await getFinishedBattlePage(first.nextCursor);
  expect(next.items[0].id).toBe(rows[50].id);
  expect(next.nextCursor).toBeNull();
  expect(query.or).toHaveBeenLastCalledWith(
    `created_at.lt.${rows[49].created_at},and(created_at.eq.${rows[49].created_at},id.lt.${rows[49].id})`,
  );
});
it('keeps canceled attempts out of the finished result section', () => {
  const sections = groupBattlesForList(
    [
      {
        id: 'cancelled',
        status: 'canceled',
        player_one_id: 'me',
        created_at: '',
      },
    ],
    'me',
  );
  expect(sections[0].key).toBe('canceled');
});

it('shows the assigned current round deadline instead of an expired parent deadline', () => {
  const battle = {
    id: 'b',
    created_at: '',
    status: 'waiting_for_prompts',
    format: 'bo3',
    current_round: 2,
    player_one_id: 'me',
    player_two_id: 'other',
    player_one_prompt_deadline: '2026-09-01T10:00:00Z',
    rounds: [
      {
        round_number: 2,
        lock_in_deadline: '2026-09-13T20:00:00Z',
        player_one_locked_at: null,
        player_two_locked_at: null,
      },
    ],
  };
  expect(activeBattleDeadline(battle, 'me')).toBe('2026-09-13T20:00:00Z');
  expect(activeBattleDeadline({ ...battle, rounds: [] }, 'me')).toBeNull();
  expect(
    activeBattleDeadline({ ...battle, status: 'completed' }, 'me'),
  ).toBeNull();
});
