/**
 * The reveal's clock: which beat is on, when it advances, and how it ends.
 *
 * Beats auto-advance on a timer; a tap anywhere goes to the next beat; Skip
 * ends the reveal. Under Reduce Motion nothing advances on its own — the
 * reveal becomes a pager with Next — and the same is true for the last beat in
 * every mode, so the payoff is read at the player's pace.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BEAT_AUTO_ADVANCE_MS, type RevealBeatKind } from '@/utils/revealBeats';

export interface UseRevealBeatsArgs {
  beats: readonly RevealBeatKind[];
  reduceMotion: boolean;
  /** False while the data the beats need is still loading. */
  enabled?: boolean;
  autoAdvanceMs?: Partial<Record<RevealBeatKind, number>>;
  onDone?: () => void;
}

export interface RevealBeatsState {
  index: number;
  current: RevealBeatKind | null;
  isLast: boolean;
  done: boolean;
  /** Whether the current beat advances on its own. */
  autoAdvancing: boolean;
  next: () => void;
  skipAll: () => void;
  /** Restart from the first beat (e.g. a "replay" affordance). */
  restart: () => void;
}

export function useRevealBeats(args: UseRevealBeatsArgs): RevealBeatsState {
  const { beats, reduceMotion, enabled = true, onDone } = args;
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(beats.length === 0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const durations = useMemo(
    () => ({ ...BEAT_AUTO_ADVANCE_MS, ...(args.autoAdvanceMs ?? {}) }),
    [args.autoAdvanceMs],
  );

  const current = done ? null : (beats[index] ?? null);
  const isLast = index >= beats.length - 1;

  const finish = useCallback(() => {
    setDone((already) => {
      if (!already) onDoneRef.current?.();
      return true;
    });
  }, []);

  const next = useCallback(() => {
    if (done) return;
    if (index >= beats.length - 1) {
      finish();
      return;
    }
    setIndex((i) => Math.min(i + 1, beats.length - 1));
  }, [done, index, beats.length, finish]);

  const skipAll = useCallback(() => finish(), [finish]);

  const restart = useCallback(() => {
    setIndex(0);
    setDone(beats.length === 0);
  }, [beats.length]);

  const autoMs = current ? durations[current] : 0;
  const autoAdvancing = Boolean(
    enabled && !done && !reduceMotion && !isLast && autoMs > 0,
  );

  useEffect(() => {
    if (!autoAdvancing) return;
    const timer = setTimeout(() => {
      setIndex((i) => Math.min(i + 1, beats.length - 1));
    }, autoMs);
    return () => clearTimeout(timer);
  }, [autoAdvancing, autoMs, index, beats.length]);

  return {
    index,
    current,
    isLast,
    done,
    autoAdvancing,
    next,
    skipAll,
    restart,
  };
}
