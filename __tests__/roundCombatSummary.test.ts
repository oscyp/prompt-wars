import { roundCombatSummary } from '@/utils/resultView';
test('round summary distinguishes additive move points from fractional stat percentage', () => {
  const text = roundCombatSummary(20, 10, 0.9, 0.05);
  expect(text).toContain('Move modifier: +0.9 pts');
  expect(text).toContain('Stat modifier: +5.0%');
  expect(text).not.toContain('90.0%');
});
