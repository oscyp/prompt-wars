import { appealPanelState } from '@/utils/appeals';

it('distinguishes checking, ready, unavailable and error and never enables a stale read', () => {
  const ready = { appeal: null, available: true, reason: null };
  expect(appealPanelState(null, true, null)).toMatchObject({
    state: 'checking',
    canSubmit: false,
  });
  expect(appealPanelState(ready, false, null)).toMatchObject({
    state: 'ready',
    canSubmit: true,
  });
  expect(
    appealPanelState(
      { ...ready, available: false, reason: 'Not calibrated.' },
      false,
      null,
    ),
  ).toMatchObject({
    state: 'unavailable',
    canSubmit: false,
    message: 'Not calibrated.',
  });
  expect(appealPanelState(ready, false, 'Read failed')).toMatchObject({
    state: 'error',
    canSubmit: false,
    message: 'Read failed',
  });
  expect(appealPanelState(ready, true, null).canSubmit).toBe(false);
});
