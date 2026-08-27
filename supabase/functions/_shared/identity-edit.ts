// Pure planning for the batched `identity` character edit.
//
// Kept out of the Edge Function body so the parts that decide what actually
// changes -- and what is a no-op that must NOT burn a cooldown -- can be tested
// without standing up a server or a database.

export type IdentityField =
  | 'name'
  | 'archetype'
  | 'battle_cry'
  | 'signature_color';

export interface IdentityFieldDef {
  field: IdentityField;
  /** Column on the `characters` row. */
  column: string;
  /** Row in `character_edit_prices`. */
  priceKey: string;
  /** Value written to `character_edits.edit_kind`, which cooldowns key off. */
  logKind: string;
}

export const IDENTITY_FIELDS: readonly IdentityFieldDef[] = [
  { field: 'name', column: 'name', priceKey: 'rename', logKind: 'name' },
  {
    field: 'archetype',
    column: 'archetype',
    priceKey: 'archetype',
    logKind: 'archetype',
  },
  {
    field: 'battle_cry',
    column: 'battle_cry',
    priceKey: 'battle_cry',
    logKind: 'battle_cry',
  },
  {
    field: 'signature_color',
    column: 'signature_color',
    priceKey: 'signature_color',
    logKind: 'signature_color',
  },
];

export const ARCHETYPES = [
  'strategist',
  'trickster',
  'titan',
  'mystic',
  'engineer',
];

/** Validates one identity field, returning either its clean value or a reason. */
export function validateIdentityField(
  field: IdentityField,
  raw: unknown,
): { value: string } | { reason: string } {
  switch (field) {
    case 'name': {
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (name.length < 1 || name.length > 40) {
        return { reason: 'name must be 1-40 chars' };
      }
      return { value: name };
    }
    case 'archetype': {
      const a = typeof raw === 'string' ? raw : '';
      if (!ARCHETYPES.includes(a)) return { reason: 'invalid archetype' };
      return { value: a };
    }
    case 'battle_cry': {
      const bc = typeof raw === 'string' ? raw.trim() : '';
      if (bc.length < 1 || bc.length > 60) {
        return { reason: 'battle_cry must be 1-60 chars' };
      }
      return { value: bc };
    }
    case 'signature_color': {
      const c = typeof raw === 'string' ? raw : '';
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) {
        return { reason: 'signature_color must be hex #RRGGBB' };
      }
      return { value: c };
    }
  }
}

export interface PlannedIdentityChange extends IdentityFieldDef {
  value: string;
  current: unknown;
}

export type IdentityPlan =
  | { ok: false; field?: IdentityField; reason: string }
  | {
      ok: true;
      changed: PlannedIdentityChange[];
      update: Record<string, unknown>;
    };

/**
 * Works out which identity fields genuinely change, validating everything
 * before reporting anything as applicable.
 *
 * Fields staged back to their saved value are dropped rather than applied: they
 * are not edits, and putting one through would start a real cooldown -- up to
 * fourteen days for an archetype -- for a change the player did not make.
 */
export function planIdentityBatch(
  character: Record<string, unknown>,
  payload: Record<string, unknown>,
): IdentityPlan {
  const present = IDENTITY_FIELDS.filter(
    (f) => payload[f.field] !== undefined && payload[f.field] !== null,
  );
  if (present.length === 0) {
    return {
      ok: false,
      reason: 'identity payload must contain at least one field',
    };
  }

  const update: Record<string, unknown> = {};
  const changed: PlannedIdentityChange[] = [];

  for (const f of present) {
    const result = validateIdentityField(f.field, payload[f.field]);
    if ('reason' in result) {
      return { ok: false, field: f.field, reason: result.reason };
    }
    if (result.value === character[f.column]) continue;
    update[f.column] = result.value;
    changed.push({ ...f, value: result.value, current: character[f.column] });
  }

  return { ok: true, changed, update };
}
