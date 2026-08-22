import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Colors } from '@/constants/Colors';
import { useThemedColors, HighContrastColors } from '@/hooks/useThemedColors';
import {
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '@/utils/accessibilitySettings';

describe('useThemedColors high contrast', () => {
  afterEach(() => {
    act(() =>
      setAccessibilityPreference(
        'highContrast',
        DEFAULT_ACCESSIBILITY_PREFERENCES.highContrast,
      ),
    );
  });

  it('returns the standard palette when high contrast is off', () => {
    const { result } = renderHook(() => useThemedColors());
    const scheme = result.current === Colors.light ? 'light' : 'dark';
    expect(result.current).toBe(Colors[scheme]);
  });

  it('swaps to the high-contrast palette when the toggle flips on', async () => {
    const { result } = renderHook(() => useThemedColors());
    const scheme = result.current === Colors.light ? 'light' : 'dark';

    act(() => setAccessibilityPreference('highContrast', true));

    await waitFor(() =>
      expect(result.current).toBe(HighContrastColors[scheme]),
    );
    expect(result.current).not.toBe(Colors[scheme]);
  });
});
