import { battleAttentionCount } from '@/utils/battleAttention';
import type { BattleListRow } from '@/utils/battleLists';
const row = (id: string, status: string, extra = {}): BattleListRow => ({
  id,
  status,
  created_at: '2026-09-13',
  player_one_id: 'me',
  player_two_id: 'them',
  ...extra,
});
test('badge excludes waiting and canceled, includes playable turns and unread revisions', () => {
  const rows = [
    row('turn', 'waiting_for_prompts'),
    row('waiting', 'waiting_for_prompts', { player_one_locked_at: 'today' }),
    row('old', 'completed'),
    row('revised', 'completed', { adjudication_revision: 2 }),
    row('cancel', 'canceled'),
  ];
  expect(battleAttentionCount(rows, 'me', { old: 0, revised: 1 })).toBe(2);
  expect(battleAttentionCount(rows, 'me', { old: 0, revised: 2 })).toBe(1);
});

test('Tier 0 viewed results clear the badge while optional video still generates', () => {
  const rows = [row('video', 'generating_video', { adjudication_revision: 2 })];
  expect(battleAttentionCount(rows, 'me', {})).toBe(1);
  expect(battleAttentionCount(rows, 'me', { video: 2 })).toBe(0);
  expect(battleAttentionCount(rows, 'me', { video: 1 })).toBe(1);
});
