import type { BattleIntegrityFields } from '@/types/battle';
export function isUnratedExhibition(
  mode: string | null | undefined,
  payload: unknown,
): boolean {
  if (mode !== 'ranked' || !payload || typeof payload !== 'object')
    return false;
  return (payload as { mock_assisted?: boolean }).mock_assisted === true;
}
export const EXHIBITION_EXPLANATION =
  'Unrated exhibition — backup judge used; rating and competitive streak unchanged.';
export function seriesDecisionExplanation(
  metadata: BattleIntegrityFields['resolution_metadata'],
  isPlayerOne: boolean,
): string | null {
  if (!metadata) return null;
  const labels: Record<string, string> = {
    ko: 'knockout',
    round_majority: 'round majority',
    round_wins: 'round wins',
    remaining_hp_percentage: 'remaining HP percentage',
    remaining_hp: 'remaining HP',
    cumulative_score: 'cumulative final score',
    draw: 'equal round wins, remaining HP and cumulative score',
  };
  const label = labels[metadata.decidingRule];
  if (!label) return null;
  const { player_one: p1, player_two: p2 } = metadata.comparison;
  if (
    metadata.decidingRule === 'ko' ||
    !Number.isFinite(p1) ||
    !Number.isFinite(p2)
  )
    return `Decided by ${label}.`;
  const format = (value: number) =>
    metadata.decidingRule === 'remaining_hp_percentage'
      ? `${Math.round(value * 100)}%`
      : Number(value.toFixed(3)).toString();
  return `Decided by ${label} · You ${format(isPlayerOne ? p1 : p2)} · Opponent ${format(isPlayerOne ? p2 : p1)}.`;
}
