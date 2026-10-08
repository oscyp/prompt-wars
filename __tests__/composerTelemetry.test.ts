import { ActiveComposerClock } from '../utils/composerTelemetry';

it('counts only focused foreground time across interruptions', () => {
  const clock = new ActiveComposerClock();
  clock.setActive(true, 1000);
  clock.setActive(false, 4000);
  expect(clock.elapsed(50000)).toBe(3000);
  clock.setActive(true, 60000);
  expect(clock.elapsed(62000)).toBe(5000);
  clock.setActive(false, 63000);
  clock.setActive(false, 90000);
  expect(clock.elapsed(100000)).toBe(6000);
});
