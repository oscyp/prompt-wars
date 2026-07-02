import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isSoundEnabled,
  loadSoundEnabled,
  setSoundEnabled,
} from '@/utils/soundSettings';

describe('soundSettings', () => {
  afterEach(() => {
    // Restore the default (ON) so ordering between tests is irrelevant.
    setSoundEnabled(true);
    jest.clearAllMocks();
  });

  it('defaults to enabled', () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it('persists a disable and reflects it synchronously', () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'pw:settings:sound_enabled',
      '0',
    );
  });

  it('hydrates a stored "0" as disabled', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('0');
    const value = await loadSoundEnabled();
    expect(value).toBe(false);
    expect(isSoundEnabled()).toBe(false);
  });

  it('keeps the current value when storage is empty', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const value = await loadSoundEnabled();
    expect(value).toBe(true);
  });
});
