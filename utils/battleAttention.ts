import AsyncStorage from '@react-native-async-storage/async-storage';
import { describeBattleRow, type BattleListRow } from '@/utils/battleLists';
export type ResultReadState = Record<string, number>;
const resultStatuses = new Set([
  'completed',
  'result_ready',
  'generating_video',
  'generation_failed',
]);
export function battleAttentionCount(
  rows: (BattleListRow & { adjudication_revision?: number })[],
  accountId: string,
  read: ResultReadState,
): number {
  return rows.filter((row) =>
    resultStatuses.has(row.status)
      ? read[row.id] !== (row.adjudication_revision ?? 0)
      : describeBattleRow(row, accountId).status.actionable,
  ).length;
}
const key = (accountId: string) => `battle-result-read:v1:${accountId}`;
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
export async function readBattleResults(
  accountId: string,
): Promise<ResultReadState> {
  await pending.get(accountId);
  const raw = await AsyncStorage.getItem(key(accountId));
  return raw ? JSON.parse(raw) : {};
}
export function markBattleResultRead(
  accountId: string,
  battleId: string,
  revision: number,
) {
  const task = (pending.get(accountId) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const raw = await AsyncStorage.getItem(key(accountId));
      await AsyncStorage.setItem(
        key(accountId),
        JSON.stringify({
          ...(raw ? JSON.parse(raw) : {}),
          [battleId]: revision,
        }),
      );
      listeners.forEach((listener) => listener());
    });
  pending.set(accountId, task);
  return task;
}
export function subscribeBattleResultRead(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
