import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  useAccessibleTextStyle,
  DYSLEXIA_TEXT_STYLE,
} from '@/hooks/useAccessibleText';
import {
  setAccessibilityPreference,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
} from '@/utils/accessibilitySettings';

describe('useAccessibleTextStyle', () => {
  afterEach(() => {
    act(() =>
      setAccessibilityPreference(
        'dyslexiaFont',
        DEFAULT_ACCESSIBILITY_PREFERENCES.dyslexiaFont,
      ),
    );
  });

  it('returns an empty style when the dyslexia-friendly font is off', () => {
    const { result } = renderHook(() => useAccessibleTextStyle());
    expect(result.current).toEqual({});
  });

  it('applies wider letter spacing when the toggle flips on', async () => {
    const { result } = renderHook(() => useAccessibleTextStyle());
    expect(result.current).toEqual({});

    act(() => setAccessibilityPreference('dyslexiaFont', true));

    await waitFor(() => expect(result.current).toEqual(DYSLEXIA_TEXT_STYLE));
    expect(result.current.letterSpacing).toBeGreaterThan(0);
  });
});
