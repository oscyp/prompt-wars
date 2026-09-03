/**
 * One tip on the scrim, labelled as a tip; it rotates on a timer under motion
 * and holds the first tip under Reduce Motion or a screen reader.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import ArenaTips from '@/components/ArenaTips';
import { TIP_INTERVAL_MS, tipForTick } from '@/utils/arenaTips';

jest.mock('@/utils/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticSelection: jest.fn(),
  hapticWarning: jest.fn(),
}));

describe('ArenaTips', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the first tip for the seed, as one text element labelled "Tip"', () => {
    const { getByText, getByLabelText } = render(
      <ArenaTips seed={3} reduceMotion={false} screenReader={false} />,
    );
    getByText(tipForTick(0, 3));
    const box = getByLabelText(`Tip: ${tipForTick(0, 3)}`);
    expect(box.props.accessibilityRole).toBe('text');
  });

  it('holds the first tip under Reduce Motion', () => {
    const { getByText, queryByText } = render(
      <ArenaTips seed={0} reduceMotion screenReader={false} />,
    );
    act(() => {
      jest.advanceTimersByTime(TIP_INTERVAL_MS * 3 + 50);
    });
    getByText(tipForTick(0));
    expect(queryByText(tipForTick(1))).toBeNull();
    expect(queryByText(tipForTick(3))).toBeNull();
  });

  it('holds the first tip while a screen reader is running', () => {
    const { getByLabelText, queryByText } = render(
      <ArenaTips seed={0} reduceMotion={false} screenReader />,
    );
    act(() => {
      jest.advanceTimersByTime(TIP_INTERVAL_MS * 2 + 50);
    });
    getByLabelText(`Tip: ${tipForTick(0)}`);
    expect(queryByText(tipForTick(1))).toBeNull();
  });

  it('rotates to the next tip every interval under motion', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <ArenaTips seed={0} reduceMotion={false} screenReader={false} />,
    );
    expect(queryByText(tipForTick(1))).toBeNull();

    act(() => {
      jest.advanceTimersByTime(TIP_INTERVAL_MS);
    });
    getByText(tipForTick(1));
    getByLabelText(`Tip: ${tipForTick(1)}`);

    act(() => {
      jest.advanceTimersByTime(TIP_INTERVAL_MS);
    });
    getByText(tipForTick(2));
    getByLabelText(`Tip: ${tipForTick(2)}`);
  });

  it('asks the OS about a screen reader when the screen does not say', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
      .mockResolvedValue(true);
    const { getByLabelText, queryByText } = render(
      <ArenaTips seed={0} reduceMotion={false} />,
    );
    // Let the permission promise settle before the first interval.
    await act(async () => {});
    act(() => {
      jest.advanceTimersByTime(TIP_INTERVAL_MS * 2 + 50);
    });
    getByLabelText(`Tip: ${tipForTick(0)}`);
    expect(queryByText(tipForTick(1))).toBeNull();
  });
});
