/**
 * What changed on a character since its live portrait was drawn.
 *
 * `appearance_version` says THAT the render is stale; this says WHAT moved, by
 * comparing the appearance columns (the set from migration 20260827160000)
 * with the `prompt_snapshot` the renderer wrote at draw time. The labels come
 * from `DRAFT_FIELDS` so the stale line and the save sheet name fields the
 * same way.
 */

import { DRAFT_FIELDS } from '@/hooks/useCharacterEditDraft';
import type { PortraitPromptSnapshot } from '@/utils/characters';

type Nullable = string | null | undefined;

/** The appearance columns of a `characters` row. Extra keys are ignored. */
export interface LookDiffCharacter {
  archetype?: Nullable;
  signature_color?: Nullable;
  signature_item_id?: Nullable;
  vibe?: Nullable;
  silhouette?: Nullable;
  palette_key?: Nullable;
  era?: Nullable;
  expression?: Nullable;
  art_style?: Nullable;
  portrait_prompt_raw?: Nullable;
}

const LABEL_BY_COLUMN: Record<string, string> = Object.fromEntries(
  DRAFT_FIELDS.map((f) => [f.column, f.label]),
);

function label(column: string): string {
  return LABEL_BY_COLUMN[column] ?? column;
}

function norm(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

interface Comparison {
  column: keyof LookDiffCharacter;
  snapshotValue: (s: PortraitPromptSnapshot) => unknown;
  /** Skip the comparison when the snapshot predates the key. */
  present?: (s: PortraitPromptSnapshot) => boolean;
  /** Both sides pass through this before comparing. */
  normalize?: (v: unknown) => string | null;
}

// Empty and null are the same prompt: "no override". Old rows and new rows
// disagree on which one they store.
const promptNorm = (v: unknown): string | null => norm(v) ?? '';

const COMPARISONS: readonly Comparison[] = [
  { column: 'archetype', snapshotValue: (s) => s.archetype },
  { column: 'signature_color', snapshotValue: (s) => s.signature_color },
  { column: 'signature_item_id', snapshotValue: (s) => s.signature_item_id },
  // `art_style` was added to the snapshot later than the rest. On an older
  // snapshot it is unknown, not changed.
  {
    column: 'art_style',
    snapshotValue: (s) => s.art_style,
    present: (s) => Object.prototype.hasOwnProperty.call(s, 'art_style'),
  },
  {
    column: 'portrait_prompt_raw',
    snapshotValue: (s) => s.raw,
    normalize: promptNorm,
  },
  { column: 'palette_key', snapshotValue: (s) => s.traits?.palette },
  { column: 'vibe', snapshotValue: (s) => s.traits?.vibe },
  { column: 'silhouette', snapshotValue: (s) => s.traits?.silhouette },
  { column: 'era', snapshotValue: (s) => s.traits?.era },
  { column: 'expression', snapshotValue: (s) => s.traits?.expression },
];

/**
 * Labels of the appearance fields that differ from the snapshot, in
 * `DRAFT_FIELDS` order. Empty when there is no snapshot to compare against.
 */
export function changedSinceRender(
  character: LookDiffCharacter,
  snapshot: PortraitPromptSnapshot | null,
): string[] {
  if (!snapshot) return [];
  const changed = new Set<string>();
  for (const c of COMPARISONS) {
    if (c.present && !c.present(snapshot)) continue;
    const normalize = c.normalize ?? norm;
    if (
      normalize(character[c.column]) !== normalize(c.snapshotValue(snapshot))
    ) {
      changed.add(c.column);
    }
  }
  // DRAFT_FIELDS order, so the line reads the same way the save sheet does.
  return DRAFT_FIELDS.filter((f) => changed.has(f.column)).map((f) =>
    label(f.column),
  );
}

/**
 * The stale line under the character's name. `null` when the render is
 * current; the generic sentence when it is stale but the snapshot is too old
 * to say why.
 */
export function describeChangedSinceRender(
  labels: readonly string[],
  stale: boolean,
): string | null {
  if (!stale) return null;
  if (labels.length > 0)
    return `Changed since last render: ${labels.join(', ')}`;
  return 'Look changed since last render';
}
