import {
  seriesDecisionExplanation,
  isUnratedExhibition,
} from '@/utils/battleExplanation';
test('explains persisted HP percentages from the viewer side without inferring missing historical decisions', () => {
  expect(seriesDecisionExplanation(null, true)).toBeNull();
  expect(
    seriesDecisionExplanation(
      {
        decidingRule: 'remaining_hp_percentage',
        comparison: { player_one: 0.25, player_two: 0.5 },
      },
      false,
    ),
  ).toBe('Decided by remaining HP percentage · You 50% · Opponent 25%.');
});
test('does not call an ordinary unrated casual battle a backup-judge exhibition', () => {
  expect(isUnratedExhibition('ranked', { mock_assisted: true })).toBe(true);
  expect(isUnratedExhibition('unranked', { mock_assisted: true })).toBe(false);
  expect(isUnratedExhibition('ranked', null)).toBe(false);
});
