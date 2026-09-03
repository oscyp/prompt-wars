import { ARCHETYPES, ARCHETYPE_LIST } from '@/constants/Archetypes';

/**
 * `rewards` is display copy for the archetype cards, not a judge coefficient.
 * It must agree with the longer `description`, or the card and the onboarding
 * step would promise two different things.
 */
describe('archetype rewards copy', () => {
  it('lists five archetypes with unique ids', () => {
    expect(ARCHETYPE_LIST).toHaveLength(5);
    expect(new Set(ARCHETYPE_LIST.map((a) => a.id)).size).toBe(5);
  });

  it.each(ARCHETYPE_LIST.map((a) => [a.id, a] as const))(
    '%s has non-empty rewards that its description mentions',
    (_id, archetype) => {
      expect(archetype.rewards.trim().length).toBeGreaterThan(0);
      expect(archetype.description.toLowerCase()).toContain(
        archetype.rewards.toLowerCase(),
      );
    },
  );

  it('keys the record by id', () => {
    for (const [key, archetype] of Object.entries(ARCHETYPES)) {
      expect(archetype.id).toBe(key);
    }
  });
});
