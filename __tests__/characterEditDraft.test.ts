import { computeDraft } from '@/hooks/useCharacterEditDraft';
import type { EditPricing } from '@/utils/editCooldowns';

const character = {
  name: 'AndrewGolota',
  archetype: 'strategist',
  battle_cry: 'Come and take it',
  signature_color: '#3B82F6',
  palette_key: 'ember',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  era: 'modern',
  expression: 'calm',
};

const pricing: EditPricing = {
  prices: {
    rename: { credits: 0, cooldownSeconds: 604800 },
    archetype: { credits: 0, cooldownSeconds: 1209600 },
    battle_cry: { credits: 0, cooldownSeconds: 86400 },
    signature_color: { credits: 0, cooldownSeconds: 86400 },
    palette: { credits: 0, cooldownSeconds: 86400 },
    traits_single_swap: { credits: 1, cooldownSeconds: 0 },
    traits_full_reroll: { credits: 2, cooldownSeconds: 0 },
  },
  cooldownMs: {},
};

const labels = {
  traitLabel: (_key: string, value: string) => value,
  identityLabel: (_key: string, value: string) => value,
};

function draft(
  identity: Record<string, string> = {},
  traits: Record<string, string> = {},
) {
  return computeDraft({
    character,
    identity: identity as never,
    traits: traits as never,
    pricing,
    ...labels,
  } as never);
}

describe('computeDraft', () => {
  it('is clean when nothing is staged', () => {
    const d = draft();
    expect(d.dirty).toBe(false);
    expect(d.changeCount).toBe(0);
    expect(d.totalCost).toBe(0);
  });

  it('ignores an identity field staged back to its saved value', () => {
    // Typing over a name and undoing it must not count as a change: saving it
    // would burn the real 7-day cooldown for nothing.
    const d = draft({ name: 'AndrewGolota' });
    expect(d.identityChanged).toEqual([]);
    expect(d.dirty).toBe(false);
  });

  it('tracks identity and look changes independently', () => {
    const d = draft({ name: 'Golota' }, { vibe: 'sinister' });
    expect(d.identityDirty).toBe(true);
    expect(d.lookDirty).toBe(true);
    expect(d.changeCount).toBe(2);
  });

  it('sums the total from identity and trait prices together', () => {
    // Identity is free; one paid trait swap is 1.
    const d = draft({ name: 'Golota' }, { vibe: 'sinister' });
    expect(d.identityCost).toBe(0);
    expect(d.traitCost).toBe(1);
    expect(d.totalCost).toBe(1);
  });

  it('prices staged traits through the live table, not the constants', () => {
    const dear: EditPricing = {
      ...pricing,
      prices: {
        ...pricing.prices,
        traits_single_swap: { credits: 4, cooldownSeconds: 0 },
        traits_full_reroll: { credits: 5, cooldownSeconds: 0 },
      },
    };
    const d = computeDraft({
      character,
      identity: {},
      traits: { vibe: 'sinister' } as never,
      pricing: dear,
      ...labels,
    } as never);
    expect(d.traitCost).toBe(4);
  });

  it('reports how long each identity field will lock for', () => {
    const d = draft({ name: 'Golota', archetype: 'titan' });
    const byLabel = Object.fromEntries(
      d.changes.map((c) => [c.label, c.locksFor]),
    );
    expect(byLabel.Name).toBe('7 days');
    expect(byLabel.Archetype).toBe('14 days');
  });

  it('reports free changes with no cooldown as unlocked', () => {
    const noCooldowns: EditPricing = {
      prices: { ...pricing.prices, rename: { credits: 0, cooldownSeconds: 0 } },
      cooldownMs: {},
    };
    const d = computeDraft({
      character,
      identity: { name: 'Golota' } as never,
      traits: {},
      pricing: noCooldowns,
      ...labels,
    } as never);
    expect(d.changes[0].locksFor).toBeUndefined();
  });

  it('routes four staged traits through the batch price', () => {
    const d = draft(
      {},
      {
        vibe: 'sinister',
        silhouette: 'heavy_bruiser',
        era: 'cyberpunk',
        expression: 'roar',
      },
    );
    expect(d.traitsUseBatch).toBe(true);
    expect(d.traitCost).toBe(2);
  });

  it('returns an empty summary with no character loaded', () => {
    const d = computeDraft({
      character: null,
      identity: {},
      traits: {},
      pricing,
      ...labels,
    } as never);
    expect(d.dirty).toBe(false);
  });
});
