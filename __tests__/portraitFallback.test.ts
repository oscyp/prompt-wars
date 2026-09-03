import { getPortraitFallbackUri } from '@/utils/characters';
import { PALETTE_HEX } from '@/constants/CharacterTraits';

function decodeSvg(uri: string): string {
  expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  const b64 = uri.replace('data:image/svg+xml;base64,', '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

describe('getPortraitFallbackUri', () => {
  it('renders a full-body 2:3 neutral silhouette with no initial letter', () => {
    const svg = decodeSvg(
      getPortraitFallbackUri({ archetype: 'mystic', signatureColor: 'ember' }),
    );
    // 2:3 aspect so it fits full-body containers without layout shift.
    expect(svg).toContain('viewBox="0 0 256 384"');
    // Silhouette (head + body path), not the legacy circle bust.
    expect(svg).toContain('<path');
    // Design language §8: a character is never an initial.
    expect(svg).not.toContain('<text');
    expect(svg).not.toContain('>M</text>');
    // Palette key resolves to its hex tint.
    expect(svg).toContain(PALETTE_HEX.ember);
  });

  it('draws the same silhouette for every archetype', () => {
    // Only the tint may vary; the glyph carries no archetype identity.
    const a = decodeSvg(getPortraitFallbackUri({ archetype: 'mystic' }));
    const b = decodeSvg(getPortraitFallbackUri({ archetype: 'titan' }));
    expect(a).toBe(b);
  });

  it('accepts raw hex signature colors and defaults unknown ones', () => {
    const hexSvg = decodeSvg(
      getPortraitFallbackUri({ archetype: 'titan', signatureColor: '#123456' }),
    );
    expect(hexSvg).toContain('#123456');

    const defaultSvg = decodeSvg(
      getPortraitFallbackUri({ archetype: 'titan' }),
    );
    expect(defaultSvg).toContain('#7C3AED');
  });

  it('is deterministic for identical input', () => {
    const a = getPortraitFallbackUri({ archetype: 'engineer' });
    const b = getPortraitFallbackUri({ archetype: 'engineer' });
    expect(a).toBe(b);
  });
});
