// Creation-time stat allocation: the server's copy of the rules.
//
// Mirrors utils/statAllocation.ts in the app. The four stats feed Bo3 HP and
// damage (start-face-off snapshots them; round-resolve reads the snapshot), so
// the client is never trusted with them directly: `characters` INSERT is
// column-scoped to exclude stat_* (20260822151000) and UPDATE is revoked.
// finalize-character-creation is the one path that writes them, and only from
// a pool every character shares -- a new fighter can be shaped, not stacked.

export const STAT_KEYS = ['strength', 'stamina', 'agility', 'focus'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatAllocation = Record<StatKey, number>;

export const STAT_MIN = 1;
export const STAT_MAX = 10;
/** Four stats at the historical default of 5 each. */
export const STAT_POINT_TOTAL = 20;

export type StatValidation =
  | { ok: true; stats: StatAllocation }
  | { ok: false; message: string };

/**
 * Accepts `{ strength, stamina, agility, focus }` with integer values in
 * [STAT_MIN, STAT_MAX] that sum to STAT_POINT_TOTAL. Unknown keys are ignored;
 * missing keys are an error (a partial block cannot be "the rest at default"
 * without changing the pool).
 */
export function validateStatAllocation(input: unknown): StatValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'stats must be an object' };
  }
  const raw = input as Record<string, unknown>;
  const stats: Partial<StatAllocation> = {};
  for (const key of STAT_KEYS) {
    const value = raw[key];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < STAT_MIN ||
      value > STAT_MAX
    ) {
      return {
        ok: false,
        message: `stats.${key} must be an integer between ${STAT_MIN} and ${STAT_MAX}`,
      };
    }
    stats[key] = value;
  }
  const total = STAT_KEYS.reduce((sum, key) => sum + (stats[key] ?? 0), 0);
  if (total !== STAT_POINT_TOTAL) {
    return {
      ok: false,
      message: `stats must total ${STAT_POINT_TOTAL} points (got ${total})`,
    };
  }
  return { ok: true, stats: stats as StatAllocation };
}

/** The `characters` columns for an allocation. */
export function statColumns(stats: StatAllocation): {
  stat_strength: number;
  stat_stamina: number;
  stat_agility: number;
  stat_focus: number;
} {
  return {
    stat_strength: stats.strength,
    stat_stamina: stats.stamina,
    stat_agility: stats.agility,
    stat_focus: stats.focus,
  };
}
