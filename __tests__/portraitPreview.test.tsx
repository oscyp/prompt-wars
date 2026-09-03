/**
 * The frame pulse must respect Reduce Motion, while the spinner overlay keeps
 * saying that a render is in flight.
 */
import React from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated } from 'react-native';
import { render, act } from '@testing-library/react-native';
import PortraitPreview from '@/components/PortraitPreview';
import {
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '@/utils/accessibilitySettings';

describe('PortraitPreview', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    act(() =>
      setAccessibilityPreference(
        'reducedMotion',
        DEFAULT_ACCESSIBILITY_PREFERENCES.reducedMotion,
      ),
    );
    jest.restoreAllMocks();
  });

  it('does not start the pulse under Reduce Motion but still shows the spinner', () => {
    act(() => setAccessibilityPreference('reducedMotion', true));
    const loop = jest.spyOn(Animated, 'loop');

    const { UNSAFE_getByType } = render(
      <PortraitPreview uri="https://example.test/fighter.png" loading />,
    );

    expect(loop).not.toHaveBeenCalled();
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('pulses while loading when motion is allowed', () => {
    const loop = jest.spyOn(Animated, 'loop');

    render(<PortraitPreview uri="https://example.test/fighter.png" loading />);

    expect(loop).toHaveBeenCalled();
  });

  it('does not pulse or spin when idle', () => {
    const loop = jest.spyOn(Animated, 'loop');

    const { UNSAFE_queryByType } = render(
      <PortraitPreview uri="https://example.test/fighter.png" />,
    );

    expect(loop).not.toHaveBeenCalled();
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });
});
