import React from 'react';
import { act, render } from '@testing-library/react-native';
import MoveSting from '@/components/reveal/MoveSting';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({ useBattlePresentationActive: jest.fn(() => true) }));

describe('reveal impact lifecycle', () => {
  beforeEach(() => { jest.useFakeTimers(); (useBattlePresentationActive as jest.Mock).mockReturnValue(true); });
  afterEach(() => jest.useRealTimers());
  it('does not repeat an already presented impact when returning from the background', () => {
    const onLanded = jest.fn();
    const view = render(<MoveSting preset="attack" color="#C4AFFE" onLanded={onLanded} />);
    act(() => jest.advanceTimersByTime(5000));
    expect(onLanded).toHaveBeenCalledTimes(1);
    (useBattlePresentationActive as jest.Mock).mockReturnValue(false);
    view.rerender(<MoveSting preset="attack" color="#C4AFFE" onLanded={onLanded} />);
    (useBattlePresentationActive as jest.Mock).mockReturnValue(true);
    view.rerender(<MoveSting preset="attack" color="#C4AFFE" onLanded={onLanded} />);
    act(() => jest.advanceTimersByTime(5000));
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
  it('cancels a pending impact on blur and finishes it only after returning', () => {
    const onLanded = jest.fn();
    const view = render(<MoveSting preset="defense" color="#C4AFFE" onLanded={onLanded} />);
    (useBattlePresentationActive as jest.Mock).mockReturnValue(false);
    view.rerender(<MoveSting preset="defense" color="#C4AFFE" onLanded={onLanded} />);
    act(() => jest.advanceTimersByTime(5000));
    expect(onLanded).not.toHaveBeenCalled();
    (useBattlePresentationActive as jest.Mock).mockReturnValue(true);
    view.rerender(<MoveSting preset="defense" color="#C4AFFE" onLanded={onLanded} />);
    act(() => jest.advanceTimersByTime(5000));
    expect(onLanded).toHaveBeenCalledTimes(1);
  });
});
