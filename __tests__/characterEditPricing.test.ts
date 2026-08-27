import {
  computeStagedTraits,
  isTraitFree,
  TRAIT_FULL_REROLL_PRICE,
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
    expect(computeStagedTraits(character, {})).toEqual({
      changed: [],
      cost: 0,
      useBatch: false,
      paidCount: 0,
    });
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

  // Applying N paid traits as N single swaps costs N credits, but the backend
  // sets all four for TRAIT_FULL_REROLL_PRICE. The edit screen used to loop
  // single swaps unconditionally, so staging three or four traits overcharged.
  it('switches to the full-reroll price once it is cheaper', () => {
    const three = computeStagedTraits(character, {
      vibe: 'regal',
      era: 'cyberpunk',
      expression: 'roar',
    });
    expect(three.paidCount).toBe(3);
    expect(three.useBatch).toBe(true);
    expect(three.cost).toBe(TRAIT_FULL_REROLL_PRICE);
    expect(three.cost).toBeLessThan(3 * TRAIT_SWAP_PRICE);

    const four = computeStagedTraits(character, {
      vibe: 'regal',
      silhouette: 'broad_bruiser',
      era: 'cyberpunk',
      expression: 'roar',
    });
    expect(four.useBatch).toBe(true);
    expect(four.cost).toBe(TRAIT_FULL_REROLL_PRICE);
  });

  it('keeps a single swap on the single-swap route', () => {
    const one = computeStagedTraits(character, { vibe: 'regal' });
    expect(one.useBatch).toBe(false);
    expect(one.cost).toBe(TRAIT_SWAP_PRICE);
  });

  // Two paid swaps tie with the reroll price, so the tie is broken on safety
  // rather than cost: looping two requests can charge for the first and then
  // fail the second, leaving the player paid-up with a half-applied change.
  it('batches at exactly two paid swaps, for the same price', () => {
    const two = computeStagedTraits(character, {
      vibe: 'regal',
      era: 'cyberpunk',
    });
    expect(two.paidCount).toBe(2);
    expect(two.useBatch).toBe(true);
    expect(two.cost).toBe(TRAIT_FULL_REROLL_PRICE);
    expect(two.cost).toBe(2 * TRAIT_SWAP_PRICE);
  });

  it('never lets a free palette change push you into the batch price', () => {
    const { cost, useBatch } = computeStagedTraits(character, {
      palette: 'ocean',
      vibe: 'regal',
    });
    expect(useBatch).toBe(false);
    expect(cost).toBe(TRAIT_SWAP_PRICE);
  });
});
