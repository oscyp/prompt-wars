/**
 * The per-move sting: nothing for no preset, a labelled badge under Reduce
 * Motion (with the landing callback at once), and a timed landing otherwise.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { MoveSting } from '@/components/reveal';
import { moveLabel } from '@/utils/battleCopy';
import { STING_LANDING_MS } from '@/utils/revealLayout';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { StingPreset } from '@/utils/revealBeats';

jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => true),
}));

const PRESETS: StingPreset[] = ['attack', 'defense', 'finisher'];

describe('MoveSting', () => {
  beforeEach(() => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
  });

  it('renders nothing for a null preset and never lands', () => {
    const onLanded = jest.fn();
    const { toJSON } = render(
      <MoveSting preset={null} color="#EF4444" onLanded={onLanded} />,
    );
    expect(toJSON()).toBeNull();
    expect(onLanded).not.toHaveBeenCalled();
  });

  it.each(PRESETS)(
    'under Reduce Motion, %s is a static badge that lands immediately',
    (preset) => {
      const onLanded = jest.fn();
      const { getByText, getByLabelText, queryByTestId } = render(
        <MoveSting preset={preset} color="#EF4444" onLanded={onLanded} />,
      );
      getByText(moveLabel(preset));
      getByLabelText(`${moveLabel(preset)} move`);
      expect(queryByTestId(`move-sting-${preset}`)).toBeNull();
      expect(onLanded).toHaveBeenCalledTimes(1);
    },
  );

  it.each(PRESETS)(
    'with motion, %s renders the animated layer and lands on its timer',
    (preset) => {
      (useReducedMotion as jest.Mock).mockReturnValue(false);
      jest.useFakeTimers();
      try {
        const onLanded = jest.fn();
        const { getByTestId, queryByTestId } = render(
          <MoveSting
            preset={preset}
            color="#EF4444"
            onLanded={onLanded}
            delayMs={100}
          />,
        );
        // The motion layer is hidden from assistive tech on purpose, so ask
        // for it explicitly.
        getByTestId(`move-sting-${preset}`, { includeHiddenElements: true });
        expect(queryByTestId('move-sting-badge')).toBeNull();
        expect(onLanded).not.toHaveBeenCalled();
        act(() => jest.advanceTimersByTime(100 + STING_LANDING_MS[preset]));
        expect(onLanded).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    },
  );
});
