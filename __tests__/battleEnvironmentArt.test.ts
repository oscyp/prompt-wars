import {
  BATTLE_ENVIRONMENTS,
  environmentForTheme,
} from '@/constants/BattleEnvironmentArt';
import {
  ARENA_PRESENTATIONS,
  presentationForTheme,
} from '@/constants/ThemeArt';
import manifest from '@/assets/images/environments/manifest.json';

it.each([
  ['Overcome an impossible challenge', 'frozen-void'],
  ['Turn weakness into strength', 'ember-forge'],
  ['The calm before the storm', 'storm-citadel'],
  ['Victory from the jaws of defeat', 'verdant-reactor'],
  ['Precision over power', 'neon-nexus'],
])('maps %s explicitly to %s', (theme, id) => {
  expect(environmentForTheme(theme).id).toBe(id);
  expect(environmentForTheme(`  ${theme.toUpperCase()}  `).id).toBe(id);
});
it('uses stable fallback and Neon Nexus for a missing theme', () => {
  expect(environmentForTheme(null).id).toBe('neon-nexus');
  expect(environmentForTheme('  ').id).toBe('neon-nexus');
  const ids = Array.from(
    { length: 40 },
    (_, n) => environmentForTheme(`Legacy ${n}`).id,
  );
  expect(new Set(ids).size).toBe(6);
  expect(environmentForTheme('Legacy 9')).toBe(environmentForTheme('Legacy 9'));
});
it('bundles twelve independently composed assets under 6 MB and leaves audio selection unchanged', () => {
  expect(BATTLE_ENVIRONMENTS).toHaveLength(6);
  expect(manifest).toHaveLength(12);
  expect(manifest.reduce((n, asset) => n + asset.bytes, 0)).toBeLessThanOrEqual(
    6_000_000,
  );
  for (const env of BATTLE_ENVIRONMENTS) {
    expect(env.banner).toBeDefined();
    expect(env.backdrop).toBeDefined();
  }
  for (const entry of manifest) {
    expect(entry.width / entry.height).toBeCloseTo(
      entry.format === 'banner' ? 3 : 2 / 3,
      2,
    );
    expect(entry.prompt).toContain('No text');
  }
  const theme = 'Overcome an impossible challenge';
  let h = 0x811c9dc5;
  for (let i = 0; i < theme.length; i++)
    h = Math.imul(h ^ theme.charCodeAt(i), 0x01000193);
  expect(presentationForTheme(theme)).toBe(ARENA_PRESENTATIONS[(h >>> 0) % 6]);
});
