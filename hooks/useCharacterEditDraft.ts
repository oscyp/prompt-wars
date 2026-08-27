import { useCallback, useMemo, useState } from 'react';
import {
  computeStagedTraits,
  StageTraitKey,
  TRAIT_FIELD,
  TRAIT_SWAP_PRICE,
  TRAIT_FULL_REROLL_PRICE,
} from '@/utils/characterEditPricing';
import {
  describeCooldownLength,
  type EditPriceKey,
  type EditPricing,
} from '@/utils/editCooldowns';

/** The four fields the batched `identity` edit kind covers. */
export type IdentityKey = 'name' | 'archetype' | 'battleCry' | 'signatureColor';

interface IdentityFieldDef {
  key: IdentityKey;
  /** Column on the character row. */
  column: string;
  label: string;
  priceKey: EditPriceKey;
}

export const IDENTITY_FIELDS: readonly IdentityFieldDef[] = [
  { key: 'name', column: 'name', label: 'Name', priceKey: 'rename' },
  {
    key: 'archetype',
    column: 'archetype',
    label: 'Archetype',
    priceKey: 'archetype',
  },
  {
    key: 'battleCry',
    column: 'battle_cry',
    label: 'Battle cry',
    priceKey: 'battle_cry',
  },
  {
    key: 'signatureColor',
    column: 'signature_color',
    label: 'Signature colour',
    priceKey: 'signature_color',
  },
];

export interface DraftChange {
  /** Which tab the change belongs to, for the per-tab staged dots. */
  section: 'identity' | 'look';
  label: string;
  /** Player-facing new value, already formatted. */
  to: string;
  /** Present when the field locks after saving, e.g. "7 days". */
  locksFor?: string;
}

export interface DraftSummary {
  identityChanged: IdentityKey[];
  traitsChanged: StageTraitKey[];
  changes: DraftChange[];
  changeCount: number;
  dirty: boolean;
  identityDirty: boolean;
  lookDirty: boolean;
  /** Identity is free today; this stays summed from live prices regardless. */
  identityCost: number;
  traitCost: number;
  totalCost: number;
  /** True when the trait apply should go through one `traits_full_reroll`. */
  traitsUseBatch: boolean;
}

export interface ComputeDraftInput {
  character: Record<string, unknown> | null;
  identity: Partial<Record<IdentityKey, string>>;
  traits: Partial<Record<StageTraitKey, string>>;
  pricing: EditPricing;
  /** Formats a staged trait value for display, e.g. `neon` -> `Neon`. */
  traitLabel: (key: StageTraitKey, value: string) => string;
  /** Formats a staged identity value for display. */
  identityLabel: (key: IdentityKey, value: string) => string;
}

const EMPTY: DraftSummary = {
  identityChanged: [],
  traitsChanged: [],
  changes: [],
  changeCount: 0,
  dirty: false,
  identityDirty: false,
  lookDirty: false,
  identityCost: 0,
  traitCost: 0,
  totalCost: 0,
  traitsUseBatch: false,
};

/**
 * Pure core of the draft: what actually differs from the saved character, what
 * it costs at live prices, and what it will lock.
 *
 * Kept separate from the hook so the money and cooldown arithmetic -- the part
 * that has to be right before the player is asked to confirm -- is directly
 * testable without rendering anything.
 */
export function computeDraft(input: ComputeDraftInput): DraftSummary {
  const { character, identity, traits, pricing, traitLabel, identityLabel } =
    input;
  if (!character) return EMPTY;

  const identityChanged: IdentityKey[] = [];
  const changes: DraftChange[] = [];
  let identityCost = 0;

  for (const field of IDENTITY_FIELDS) {
    const staged = identity[field.key];
    // A field staged back to its saved value is not a change. Counting it would
    // put a phantom entry in the save bar and burn a real cooldown on save.
    if (staged == null || staged === character[field.column]) continue;
    identityChanged.push(field.key);
    const price = pricing.prices[field.priceKey];
    identityCost += price?.credits ?? 0;
    changes.push({
      section: 'identity',
      label: field.label,
      to: identityLabel(field.key, staged),
      locksFor:
        describeCooldownLength(price?.cooldownSeconds ?? 0) ?? undefined,
    });
  }

  const {
    changed: traitsChanged,
    cost: traitCost,
    useBatch: traitsUseBatch,
  } = computeStagedTraits(character, traits, {
    swap: pricing.prices.traits_single_swap?.credits ?? TRAIT_SWAP_PRICE,
    fullReroll:
      pricing.prices.traits_full_reroll?.credits ?? TRAIT_FULL_REROLL_PRICE,
  });

  for (const key of traitsChanged) {
    const value = traits[key];
    if (value == null) continue;
    const priceKey: EditPriceKey =
      key === 'palette' ? 'palette' : 'traits_single_swap';
    changes.push({
      section: 'look',
      label: TRAIT_LABELS_BY_KEY[key],
      to: traitLabel(key, value),
      locksFor:
        describeCooldownLength(
          pricing.prices[priceKey]?.cooldownSeconds ?? 0,
        ) ?? undefined,
    });
  }

  const changeCount = identityChanged.length + traitsChanged.length;

  return {
    identityChanged,
    traitsChanged,
    changes,
    changeCount,
    dirty: changeCount > 0,
    identityDirty: identityChanged.length > 0,
    lookDirty: traitsChanged.length > 0,
    identityCost,
    traitCost,
    totalCost: identityCost + traitCost,
    traitsUseBatch,
  };
}

const TRAIT_LABELS_BY_KEY: Record<StageTraitKey, string> = {
  palette: 'Outfit palette',
  vibe: 'Vibe',
  silhouette: 'Silhouette',
  era: 'Era',
  expression: 'Expression',
};

export interface UseCharacterEditDraft extends DraftSummary {
  identity: Partial<Record<IdentityKey, string>>;
  traits: Partial<Record<StageTraitKey, string>>;
  stageIdentity: (key: IdentityKey, value: string) => void;
  stageTrait: (key: StageTraitKey, value: string) => void;
  clear: () => void;
  /** Payload for the batched `identity` edit, or null when nothing changed. */
  identityPayload: Partial<Record<IdentityKey, string>> | null;
}

/**
 * Holds every unsaved edit on the character screen behind one Save action.
 *
 * The screen previously ran three commit models at once: traits staged and
 * batch-applied, while signature colour and signature item committed on tap --
 * the colour silently starting a 24-hour cooldown with no confirmation. One
 * draft means one place where "what changes, what it costs, what it locks" is
 * answered, and one moment where the player agrees to all three.
 */
export function useCharacterEditDraft(
  character: Record<string, unknown> | null,
  pricing: EditPricing,
  labels: {
    traitLabel: (key: StageTraitKey, value: string) => string;
    identityLabel: (key: IdentityKey, value: string) => string;
  },
): UseCharacterEditDraft {
  const [identity, setIdentity] = useState<
    Partial<Record<IdentityKey, string>>
  >({});
  const [traits, setTraits] = useState<Partial<Record<StageTraitKey, string>>>(
    {},
  );

  const stageIdentity = useCallback((key: IdentityKey, value: string) => {
    setIdentity((prev) => ({ ...prev, [key]: value }));
  }, []);

  const stageTrait = useCallback((key: StageTraitKey, value: string) => {
    setTraits((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clear = useCallback(() => {
    setIdentity({});
    setTraits({});
  }, []);

  const { traitLabel, identityLabel } = labels;
  const summary = useMemo(
    () =>
      computeDraft({
        character,
        identity,
        traits,
        pricing,
        traitLabel,
        identityLabel,
      }),
    [character, identity, traits, pricing, traitLabel, identityLabel],
  );

  const identityPayload = useMemo(() => {
    if (summary.identityChanged.length === 0) return null;
    const payload: Partial<Record<IdentityKey, string>> = {};
    for (const key of summary.identityChanged) payload[key] = identity[key];
    return payload;
  }, [summary.identityChanged, identity]);

  return {
    ...summary,
    identity,
    traits,
    stageIdentity,
    stageTrait,
    clear,
    identityPayload,
  };
}

export { TRAIT_FIELD };
