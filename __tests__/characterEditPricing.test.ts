import {
  computeStagedTraits,
  isTraitFree,
  TRAIT_SWAP_PRICE,
} from '@/utils/characterEditPricing';

const character = {
  palette_key: 'ember',
  vibe: 'heroic',
  silhouette: 'lean_duelist',
  era: 'modern',
  expression: 'smirk',
};

describe('computeStagedTraits', () => {
  it('reports no changes and zero cost when nothing is staged', () => {
    expect(computeStagedTraits(character, {})).toEqual({ changed: [], cost: 0 });
  });

  it('ignores staged values equal to the current value', () => {
    const { changed, cost } = computeStagedTraits(character, {
      vibe: 'heroic',
    });
    expect(changed).toEqual([]);
    expect(cost).toBe(0);
  });

  it('charges 1 credit per changed paid trait', () => {
    const { changed, cost } = computeStagedTraits(character, {
      vibe: 'sinister',
      era: 'cyberpunk',
    });
    expect(changed).toEqual(expect.arrayContaining(['vibe', 'era']));
    expect(changed).toHaveLength(2);
    expect(cost).toBe(2 * TRAIT_SWAP_PRICE);
  });

  it('treats palette as a free change', () => {
    const { changed, cost } = computeStagedTraits(character, {
      palette: 'ocean',
    });
    expect(changed).toEqual(['palette']);
    expect(cost).toBe(0);
    expect(isTraitFree('palette')).toBe(true);
    expect(isTraitFree('vibe')).toBe(false);
  });

  it('sums a mixed free + paid batch', () => {
    const { changed, cost } = computeStagedTraits(character, {
      palette: 'ocean',
      vibe: 'regal',
      expression: 'roar',
    });
    expect(changed).toHaveLength(3);
    expect(cost).toBe(2 * TRAIT_SWAP_PRICE); // palette free, vibe + expression paid
  });
});
