import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { BattleDeadline } from '@/components/game/battle/BattleDeadline';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import { exactBattleDeadline } from '@/utils/battleCopy';
import { hapticWarning } from '@/utils/haptics';

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => true) }));
jest.mock('@/utils/haptics', () => ({ hapticWarning: jest.fn() }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: jest.fn(),
}));

const NOW = Date.parse('2026-09-30T12:00:00Z');
const deadlineAfter = (ms: number) => new Date(NOW + ms).toISOString();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  jest.mocked(useBattlePresentationActive).mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

test('counts down every second with explicit time units for screen readers', () => {
  const deadline = deadlineAfter(3_723_000);
  const screen = render(<BattleDeadline deadline={deadline} />);
  expect(screen.getByText('Lock in · 01:02:03')).toBeTruthy();
  const timer = screen.getByRole('timer');
  expect(timer.props.accessibilityLabel).toContain(
    '1 hour, 2 minutes, 3 seconds remaining to lock in',
  );
  expect(timer.props.accessibilityLabel).toContain(
    exactBattleDeadline(deadline),
  );
  expect(timer.props.accessibilityLiveRegion).toBe('none');

  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Lock in · 01:02:02')).toBeTruthy();
  screen.unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('uses the full assigned window and never wraps hours at midnight', () => {
  const screen = render(
    <BattleDeadline deadline={deadlineAfter(86_400_000)} />,
  );
  expect(screen.getByText('Lock in · 24:00:00')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Lock in · 23:59:59')).toBeTruthy();
});

test('rounds the last partial second up, then stops at the passed state', () => {
  const screen = render(<BattleDeadline deadline={deadlineAfter(1500)} />);
  expect(screen.getByText('Lock in · 00:00:02')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Lock in · 00:00:01')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Lock-in deadline passed')).toBeTruthy();
  expect(jest.getTimerCount()).toBe(0);
});

test('recalculates from the deadline on return instead of resuming a stale counter', () => {
  const deadline = deadlineAfter(3_600_000);
  const screen = render(<BattleDeadline deadline={deadline} />);
  jest.mocked(useBattlePresentationActive).mockReturnValue(false);
  screen.rerender(<BattleDeadline deadline={deadline} />);
  expect(jest.getTimerCount()).toBe(0);
  act(() => jest.advanceTimersByTime(3_601_000));
  jest.mocked(useBattlePresentationActive).mockReturnValue(true);
  screen.rerender(<BattleDeadline deadline={deadline} />);
  expect(screen.getByText('Lock-in deadline passed')).toBeTruthy();
  expect(jest.getTimerCount()).toBe(0);
});

test.each([null, 'invalid timestamp'])(
  'does not invent a timer for %s',
  (deadline) => {
    const screen = render(<BattleDeadline deadline={deadline} />);
    expect(screen.getByText(exactBattleDeadline(deadline))).toBeTruthy();
    expect(screen.queryByText(/Lock in ·/)).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
    expect(hapticWarning).not.toHaveBeenCalled();
  },
);

test('warns once per round and restarts for a new authoritative deadline', () => {
  const screen = render(<BattleDeadline deadline={deadlineAfter(121_000)} />);
  expect(hapticWarning).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1000));
  expect(hapticWarning).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(120_000));
  expect(screen.getByText('Lock-in deadline passed')).toBeTruthy();
  expect(hapticWarning).toHaveBeenCalledTimes(1);
  screen.rerender(<BattleDeadline deadline={deadlineAfter(181_000)} />);
  expect(screen.getByText('Lock in · 00:01:00')).toBeTruthy();
  expect(hapticWarning).toHaveBeenCalledTimes(2);
});
