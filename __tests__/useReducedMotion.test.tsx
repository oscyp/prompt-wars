import { AccessibilityInfo } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '@/utils/accessibilitySettings';

describe('useReducedMotion', () => {
  beforeEach(() => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    // Reset inside act(): mounted hooks still hold a live subscription.
    act(() =>
      setAccessibilityPreference(
        'reducedMotion',
        DEFAULT_ACCESSIBILITY_PREFERENCES.reducedMotion,
      ),
    );
    jest.restoreAllMocks();
  });

  it('is false when neither the OS nor the app forces reduced motion', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('becomes true when the app manual override is enabled', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    act(() => setAccessibilityPreference('reducedMotion', true));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('is true when the OS reports reduced motion even if app override is off', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(
      true,
    );
    const { result } = renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
