import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  getAccessibilityPreferences,
  isReducedMotionForced,
  loadAccessibilityPreferences,
  setAccessibilityPreference,
  subscribeAccessibility,
} from '@/utils/accessibilitySettings';

describe('accessibilitySettings', () => {
  afterEach(() => {
    // Reset to defaults so tests don't leak module-scope state into each other.
    (
      Object.keys(DEFAULT_ACCESSIBILITY_PREFERENCES) as (keyof typeof DEFAULT_ACCESSIBILITY_PREFERENCES)[]
    ).forEach((key) => {
      setAccessibilityPreference(key, DEFAULT_ACCESSIBILITY_PREFERENCES[key]);
    });
    jest.clearAllMocks();
  });

  it('exposes sensible defaults (motion on, dynamic type on)', () => {
    expect(getAccessibilityPreferences()).toEqual(
      DEFAULT_ACCESSIBILITY_PREFERENCES,
    );
    expect(isReducedMotionForced()).toBe(false);
  });

  it('updates the in-memory value and persists it', () => {
    setAccessibilityPreference('reducedMotion', true);
    expect(getAccessibilityPreferences().reducedMotion).toBe(true);
    expect(isReducedMotionForced()).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'pw:settings:accessibility',
      expect.stringContaining('"reducedMotion":true'),
    );
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAccessibility(listener);

    setAccessibilityPreference('highContrast', true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ highContrast: true }),
    );

    unsubscribe();
    setAccessibilityPreference('highContrast', false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a misbehaving subscriber cannot break propagation to others', () => {
    const good = jest.fn();
    subscribeAccessibility(() => {
      throw new Error('boom');
    });
    subscribeAccessibility(good);

    expect(() =>
      setAccessibilityPreference('dyslexiaFont', true),
    ).not.toThrow();
    expect(good).toHaveBeenCalled();
  });

  it('hydrates a stored partial over the defaults', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ dyslexiaFont: true }),
    );

    const result = await loadAccessibilityPreferences();

    expect(result.dyslexiaFont).toBe(true);
    // Unspecified keys fall back to defaults.
    expect(result.dynamicType).toBe(DEFAULT_ACCESSIBILITY_PREFERENCES.dynamicType);
    expect(getAccessibilityPreferences().dyslexiaFont).toBe(true);
  });

  it('keeps defaults when stored value is corrupt', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('not-json{');

    const result = await loadAccessibilityPreferences();

    expect(result).toEqual(DEFAULT_ACCESSIBILITY_PREFERENCES);
  });
});
