/**
 * Creation-time stat allocation: the rules, the copy and the presets.
 *
 * The four stats are the ones the battle engine already reads
 * (`characters.stat_*`, snapshotted into the battle at face-off; see the
 * concept doc §7.7). Every character starts from the same pool, so a new
 * fighter is never stronger in total than an existing one — only shaped
 * differently. The server validates the same rules in
 * `supabase/functions/_shared/character-stats.ts`; this module exists so the
 * screen can say "2 points left" without a round trip.
 */

import type { ArchetypeId } from '@/constants/Archetypes';
import type { StatBlock } from '@/types/battle';

export type StatKey = keyof StatBlock;

export const STAT_KEYS: readonly StatKey[] = [
  'strength',
  'stamina',
  'agility',
  'focus',
];

export const STAT_MIN = 1;
export const STAT_MAX = 10;
/** Four stats at the historical default of 5 each. */
export const STAT_POINT_TOTAL = 20;

export const BALANCED_STATS: StatBlock = {
  strength: 5,
  stamina: 5,
  agility: 5,
  focus: 5,
};

export interface StatMeta {
  label: string;
  abbreviation: string;
  /** What the stat does in a battle, in the player's words. */
  effect: string;
}

/** Effects paraphrase the round maths in the concept doc; keep them honest. */
export const STAT_META: Record<StatKey, StatMeta> = {
  strength: {
    label: 'Strength',
    abbreviation: 'STR',
    effect: 'Hits harder — more damage when you win a round.',
  },
  stamina: {
    label: 'Stamina',
    abbreviation: 'STA',
    effect: 'More HP, so you can lose a round and still take the series.',
  },
  agility: {
    label: 'Agility',
    abbreviation: 'AGI',
    effect: 'Edges the close ones — initiative and tiebreaks.',
  },
  focus: {
    label: 'Focus',
    abbreviation: 'FOC',
    effect: 'Steadier — less swing in your stat bonus from round to round.',
  },
};

/**
 * A starting point per archetype, not a bonus: every preset spends exactly
 * the shared pool. Players are free to move every point afterwards.
 */
export const ARCHETYPE_STAT_PRESETS: Record<ArchetypeId, StatBlock> = {
  strategist: { strength: 4, stamina: 5, agility: 4, focus: 7 },
  trickster: { strength: 4, stamina: 4, agility: 8, focus: 4 },
  titan: { strength: 8, stamina: 6, agility: 3, focus: 3 },
  mystic: { strength: 3, stamina: 5, agility: 4, focus: 8 },
  engineer: { strength: 5, stamina: 6, agility: 3, focus: 6 },
};

export function statTotal(stats: StatBlock): number {
  return STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

/** Points still to place. Negative when over the pool (never via the UI). */
export function pointsRemaining(stats: StatBlock): number {
  return STAT_POINT_TOTAL - statTotal(stats);
}

export function canIncrement(stats: StatBlock, key: StatKey): boolean {
  return stats[key] < STAT_MAX && pointsRemaining(stats) > 0;
}

export function canDecrement(stats: StatBlock, key: StatKey): boolean {
  return stats[key] > STAT_MIN;
}

/** One step up or down on one stat; returns the same object when not allowed. */
export function adjustStat(
  stats: StatBlock,
  key: StatKey,
  delta: 1 | -1,
): StatBlock {
  if (delta > 0 && !canIncrement(stats, key)) return stats;
  if (delta < 0 && !canDecrement(stats, key)) return stats;
  return { ...stats, [key]: stats[key] + delta };
}

function isIntInRange(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= STAT_MIN &&
    value <= STAT_MAX
  );
}

/** Every stat an integer in range and the whole pool spent. */
export function isValidAllocation(stats: StatBlock): boolean {
  return (
    STAT_KEYS.every((key) => isIntInRange(stats[key])) &&
    statTotal(stats) === STAT_POINT_TOTAL
  );
}

/** Why Next is disabled on the stats step; undefined when it is enabled. */
export function allocationHint(stats: StatBlock): string | undefined {
  const remaining = pointsRemaining(stats);
  if (remaining > 0) {
    return `Spend ${remaining} more ${remaining === 1 ? 'point' : 'points'} to continue`;
  }
  if (remaining < 0) {
    const over = -remaining;
    return `Remove ${over} ${over === 1 ? 'point' : 'points'} to continue`;
  }
  return isValidAllocation(stats)
    ? undefined
    : 'Each stat needs between 1 and 10 points';
}

/** "N points left" / "All points placed" for the step header. */
export function remainingLabel(stats: StatBlock): string {
  const remaining = pointsRemaining(stats);
  if (remaining === 0) return 'All points placed';
  if (remaining === 1) return '1 point left';
  if (remaining > 1) return `${remaining} points left`;
  return `${-remaining} over`;
}

/** Compact recap for the confirm summary: "STR 8 · STA 6 · AGI 3 · FOC 3". */
export function describeAllocation(stats: StatBlock): string {
  return STAT_KEYS.map(
    (key) => `${STAT_META[key].abbreviation} ${stats[key]}`,
  ).join(' · ');
}

export function presetFor(archetype: ArchetypeId): StatBlock {
  return { ...ARCHETYPE_STAT_PRESETS[archetype] };
}

export function sameAllocation(a: StatBlock, b: StatBlock): boolean {
  return STAT_KEYS.every((key) => a[key] === b[key]);
}
