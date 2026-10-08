import { shareBattleVideo, shareResultCard } from '@/utils/share';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  downloadAsync: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

it('never opens sharing for a capture invalidated by a reviewed result', async () => {
  let current = true;
  jest.mocked(captureRef).mockImplementation(async () => {
    current = false;
    return 'file://old.png';
  });
  await expect(
    shareResultCard({ current: {} } as never, () => current),
  ).rejects.toThrow(/changed/);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

it('shares the image when its result revision remains current', async () => {
  jest.mocked(captureRef).mockResolvedValue('file://current.png');
  await expect(
    shareResultCard({ current: {} } as never, () => true),
  ).resolves.toBe(true);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(
    'file://current.png',
    expect.anything(),
  );
});

it('does not open video sharing when the result changes during download', async () => {
  let finishDownload!: (value: { uri: string }) => void;
  let current = true;
  jest.mocked(FileSystem.downloadAsync).mockReturnValue(
    new Promise((resolve) => {
      finishDownload = resolve;
    }) as never,
  );
  const sharing = shareBattleVideo(
    'https://example.com/current.mp4',
    () => current,
  );
  current = false;
  finishDownload({ uri: 'file://cache/cinematic.mp4' });

  await expect(sharing).rejects.toThrow(/result changed/i);
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
