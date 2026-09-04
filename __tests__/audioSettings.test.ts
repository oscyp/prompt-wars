import {
  DEFAULT_AUDIO_PREFERENCES,
  getAudioPreferences,
  loadAudioPreferences,
  setAudioPreference,
} from '@/utils/audioSettings';

describe('audio preferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await loadAudioPreferences();
  });

  it('enables music and sound effects by default', () => {
    expect(getAudioPreferences()).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it('persists music and sound effects independently', async () => {
    setAudioPreference('music', false);
    expect(getAudioPreferences()).toEqual({
      music: false,
      soundEffects: true,
    });

    setAudioPreference('soundEffects', false);
    const stored = JSON.stringify({ music: false, soundEffects: false });
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      'prompt-wars:audio-preferences:v1',
      stored,
    );
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(stored);
    await expect(loadAudioPreferences()).resolves.toEqual({
      music: false,
      soundEffects: false,
    });
  });
});
import AsyncStorage from '@react-native-async-storage/async-storage';
