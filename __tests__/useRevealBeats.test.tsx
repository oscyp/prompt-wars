import { renderHook, act } from '@testing-library/react-native';
import { useRevealBeats } from '@/hooks/useRevealBeats';
import type { RevealBeatKind } from '@/utils/revealBeats';

const BEATS: RevealBeatKind[] = ['verdict', 'winner', 'judge', 'payoff'];

describe('useRevealBeats', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('auto-advances through the timed beats and stops on the payoff', () => {
    const { result } = renderHook(() =>
      useRevealBeats({
        beats: BEATS,
        reduceMotion: false,
        autoAdvanceMs: { verdict: 100, winner: 100, judge: 100 },
      }),
    );
    expect(result.current.current).toBe('verdict');
    expect(result.current.autoAdvancing).toBe(true);
    act(() => jest.advanceTimersByTime(100));
    expect(result.current.current).toBe('winner');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current.current).toBe('judge');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current.current).toBe('payoff');
    expect(result.current.isLast).toBe(true);
    expect(result.current.autoAdvancing).toBe(false);
    act(() => jest.advanceTimersByTime(10_000));
    expect(result.current.done).toBe(false);
  });

  it('a tap advances immediately and the last tap finishes once', () => {
    const onDone = jest.fn();
    const { result } = renderHook(() =>
      useRevealBeats({ beats: BEATS, reduceMotion: false, onDone }),
    );
    act(() => result.current.next());
    expect(result.current.current).toBe('winner');
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.current).toBe('payoff');
    act(() => result.current.next());
    expect(result.current.done).toBe(true);
    expect(result.current.current).toBeNull();
    act(() => result.current.next());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Reduce Motion turns it into a pager: nothing advances on its own', () => {
    const { result } = renderHook(() =>
      useRevealBeats({ beats: BEATS, reduceMotion: true }),
    );
    expect(result.current.autoAdvancing).toBe(false);
    act(() => jest.advanceTimersByTime(60_000));
    expect(result.current.current).toBe('verdict');
    act(() => result.current.next());
    expect(result.current.current).toBe('winner');
  });

  it('skip ends the reveal from any beat and restart brings it back', () => {
    const onDone = jest.fn();
    const { result } = renderHook(() =>
      useRevealBeats({ beats: BEATS, reduceMotion: false, onDone }),
    );
    act(() => result.current.skipAll());
    expect(result.current.done).toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => result.current.restart());
    expect(result.current.done).toBe(false);
    expect(result.current.current).toBe('verdict');
  });

  it('does not tick while disabled, and an empty beat list is already done', () => {
    const { result } = renderHook(() =>
      useRevealBeats({
        beats: BEATS,
        reduceMotion: false,
        enabled: false,
        autoAdvanceMs: { verdict: 50 },
      }),
    );
    act(() => jest.advanceTimersByTime(500));
    expect(result.current.current).toBe('verdict');
    const empty = renderHook(() =>
      useRevealBeats({ beats: [], reduceMotion: false }),
    );
    expect(empty.result.current.done).toBe(true);
  });
});
