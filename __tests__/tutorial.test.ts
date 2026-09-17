import { tutorialHint, type TutorialState } from '@/utils/tutorialState';
import {
  adjustStat,
  isValidAllocation,
  pointsRemaining,
} from '@/utils/statAllocation';

const state: TutorialState = {
  battle_id: 'practice',
  dismissed_hints: [],
  completed_at: null,
};
test('resumed practice displays only the contextual hint for its battle', () => {
  expect(tutorialHint(state, 'practice', 'theme')).toContain('theme');
  expect(tutorialHint(state, 'other', 'theme')).toBeNull();
  expect(
    tutorialHint({ ...state, dismissed_hints: ['theme'] }, 'practice', 'theme'),
  ).toBeNull();
});
test('completion suppresses writing hints; an explicit replay restores them', () => {
  expect(
    tutorialHint({ ...state, completed_at: 'today' }, 'practice', 'write'),
  ).toBeNull();
  expect(
    tutorialHint({ ...state, battle_id: 'replay' }, 'replay', 'write'),
  ).toContain('prompt');
});
test('a progressed respec spends the actual pool instead of losing earned points', () => {
  const stats = { strength: 5, stamina: 6, agility: 6, focus: 6 };
  expect(pointsRemaining(stats, 24)).toBe(1);
  const allocated = adjustStat(stats, 'strength', 1, 24);
  expect(allocated.strength).toBe(6);
  expect(isValidAllocation(allocated, 24)).toBe(true);
  expect(isValidAllocation(allocated)).toBe(false);
});
