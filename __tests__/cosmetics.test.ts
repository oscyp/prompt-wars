import {
  COSMETIC_PRESENTATION,
  RENDERABLE_COSMETIC_TYPES,
  presentationFor,
  type CosmeticSlug,
} from '@/constants/Cosmetics';
import {
  resolveEquippedCosmetics,
  unlockedColorSwatches,
  NO_COSMETICS,
} from '@/utils/cosmetics';

/**
 * The live catalogue, as of the migration that seeded it. If a row is added,
 * this list and the presentation registry both have to grow — which is the
 * point: an unmapped cosmetic renders as nothing at all, silently, exactly the
 * way a missing portrait phrase shipped `lean_duelist` to the image model.
 */
const CATALOGUE: { slug: string; type: string }[] = [
  { slug: 'plus_aura', type: 'avatar_effect' },
  { slug: 'streak_badge', type: 'badge' },
  { slug: 'crimson_color', type: 'color' },
  { slug: 'galaxy_color', type: 'color' },
  { slug: 'classic_frame', type: 'frame' },
  { slug: 'veteran_frame', type: 'frame' },
  { slug: 'gold_frame', type: 'frame' },
  { slug: 'plus_frame', type: 'frame' },
  { slug: 'neon_frame', type: 'frame' },
  { slug: 'founders_frame', type: 'frame' },
  { slug: 'noir_reveal', type: 'reveal_style' },
  { slug: 'inferno_reveal', type: 'reveal_style' },
  { slug: 'rookie_title', type: 'title' },
  { slug: 'champion_title', type: 'title' },
  { slug: 'plus_title', type: 'title' },
  { slug: 'royal_title', type: 'title' },
];

describe('presentation registry coverage', () => {
  it('has an entry for every catalogue slug', () => {
    const missing = CATALOGUE.filter((c) => !COSMETIC_PRESENTATION[c.slug as CosmeticSlug]);
    expect(missing.map((c) => c.slug)).toEqual([]);
  });

  it('has no entry for a slug that cannot occur', () => {
    const known = new Set(CATALOGUE.map((c) => c.slug));
    expect(Object.keys(COSMETIC_PRESENTATION).filter((s) => !known.has(s))).toEqual([]);
  });

  it('gives every entry the kind its catalogue type implies', () => {
    // A title keyed as a frame would render a frame's fields and draw nothing.
    for (const { slug, type } of CATALOGUE) {
      expect(COSMETIC_PRESENTATION[slug as CosmeticSlug].kind).toBe(type);
    }
  });

  it('excludes reveal_style from the renderable types', () => {
    // It can be owned and equipped, but nothing draws it, so it must not be
    // sold. The Edge Function enforces the same list.
    expect(RENDERABLE_COSMETIC_TYPES).not.toContain('reveal_style');
    expect([...RENDERABLE_COSMETIC_TYPES].sort()).toEqual([
      'avatar_effect', 'badge', 'color', 'frame', 'title',
    ]);
  });

  it('gives every frame at least one colour', () => {
    for (const { slug, type } of CATALOGUE) {
      if (type !== 'frame') continue;
      const p = COSMETIC_PRESENTATION[slug as CosmeticSlug];
      expect(p.kind === 'frame' && p.colors.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveEquippedCosmetics', () => {
  it('returns nothing equipped for an empty or missing config', () => {
    expect(resolveEquippedCosmetics(null)).toEqual(NO_COSMETICS);
    expect(resolveEquippedCosmetics(undefined)).toEqual(NO_COSMETICS);
    expect(resolveEquippedCosmetics({})).toEqual(NO_COSMETICS);
  });

  it('resolves a partial config without inventing the rest', () => {
    const result = resolveEquippedCosmetics({ frame: 'neon_frame' });
    expect(result.frame?.kind).toBe('frame');
    expect(result.title).toBeNull();
    expect(result.badge).toBeNull();
  });

  it('degrades to null on a slug the registry does not know', () => {
    // A catalogue row shipped ahead of client support must not crash a battle.
    expect(resolveEquippedCosmetics({ frame: 'from_the_future' }).frame).toBeNull();
  });

  it('refuses a slug filed under the wrong type', () => {
    // Otherwise a title's fields get read as a frame's.
    expect(resolveEquippedCosmetics({ frame: 'royal_title' }).frame).toBeNull();
  });

  it('ignores reveal_style entirely', () => {
    const result = resolveEquippedCosmetics({ reveal_style: 'noir_reveal' });
    expect(result).toEqual(NO_COSMETICS);
  });

  it('resolves a full loadout', () => {
    const result = resolveEquippedCosmetics({
      frame: 'gold_frame',
      title: 'champion_title',
      badge: 'streak_badge',
      avatar_effect: 'plus_aura',
    });
    expect(result.frame?.kind).toBe('frame');
    expect(result.title?.label).toBe('Champion');
    expect(result.badge?.label).toBe('On Fire');
    expect(result.avatarEffect?.kind).toBe('avatar_effect');
  });
});

describe('unlockedColorSwatches', () => {
  const item = (slug: string, type: string, owned: boolean) =>
    ({ slug, cosmetic_type: type, owned }) as never;

  it('returns only owned colour cosmetics', () => {
    const swatches = unlockedColorSwatches([
      item('crimson_color', 'color', true),
      item('galaxy_color', 'color', false),
      item('neon_frame', 'frame', true),
    ]);
    expect(swatches).toEqual([
      { value: '#EF4444', label: 'Crimson', hex: '#EF4444' },
    ]);
  });

  it('returns nothing when the player owns no colours', () => {
    expect(unlockedColorSwatches([item('neon_frame', 'frame', true)])).toEqual([]);
  });
});

describe('presentationFor', () => {
  it('is null for absent input rather than throwing', () => {
    expect(presentationFor(null)).toBeNull();
    expect(presentationFor(undefined)).toBeNull();
    expect(presentationFor('nope')).toBeNull();
  });
});
