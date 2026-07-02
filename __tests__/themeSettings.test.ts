import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_THEME_PREFERENCE,
  getThemePreference,
  loadThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from '@/utils/themeSettings';

describe('themeSettings', () => {
  afterEach(() => {
    // Restore the default (dark) so ordering between tests is irrelevant.
    setThemePreference(DEFAULT_THEME_PREFERENCE);
    jest.clearAllMocks();
  });

  it('defaults to dark (Cinematic Arena is dark-first)', () => {
    expect(getThemePreference()).toBe('dark');
  });

  it('persists a change and reflects it synchronously', () => {
    setThemePreference('light');
    expect(getThemePreference()).toBe('light');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'pw:settings:theme',
      'light',
    );
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeThemePreference(listener);

    setThemePreference('system');
    expect(listener).toHaveBeenCalledWith('system');

    unsubscribe();
    setThemePreference('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('hydrates a stored preference', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('light');
    const value = await loadThemePreference();
    expect(value).toBe('light');
    expect(getThemePreference()).toBe('light');
  });

  it('ignores unknown stored values and keeps the default', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('neon');
    const value = await loadThemePreference();
    expect(value).toBe(DEFAULT_THEME_PREFERENCE);
  });

  it('keeps the current value when storage is empty', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const value = await loadThemePreference();
    expect(value).toBe(DEFAULT_THEME_PREFERENCE);
  });
});
