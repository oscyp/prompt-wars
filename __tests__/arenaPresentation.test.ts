import {
  ARENA_PRESENTATIONS,
  presentationForTheme,
} from '@/constants/ThemeArt';

describe('arena presentation', () => {
  it('ships six reusable client-only mood packs', () => {
    expect(ARENA_PRESENTATIONS).toHaveLength(6);
    expect(new Set(ARENA_PRESENTATIONS.map((pack) => pack.id)).size).toBe(6);
    expect(ARENA_PRESENTATIONS.every((pack) => pack.ambientLoop)).toBe(true);
  });

  it('maps the same free-text theme deterministically', () => {
    const first = presentationForTheme('The calm before the storm');
    const replay = presentationForTheme('The calm before the storm');
    expect(replay.id).toBe(first.id);
    expect(replay.accent).toBe(first.accent);
  });
});
