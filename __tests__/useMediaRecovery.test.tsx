import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMediaRecovery } from '@/hooks/useMediaRecovery';

it('recovers signing without purchasing and keeps caption failure independent', async () => {
  const resolveVideoUrl = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue('signed-video');
  const resolveCaptions = async () => {
    throw new Error('captions unavailable');
  };
  const { result } = renderHook(() =>
    useMediaRecovery({
      assetKey: 'user:battle:video',
      resolveVideoUrl,
      resolveCaptions,
    }),
  );
  await waitFor(() => expect(result.current.playbackStatus).toBe('error'));
  await act(async () => {
    await result.current.retry();
  });
  expect(result.current.videoUrl).toBe('signed-video');
  expect(result.current.playbackStatus).toBe('ready');
  expect(result.current.captionError).toBe('captions unavailable');
});

it('does not expose a previous account or asset while the next URL resolves', async () => {
  let resolve: (url: string) => void = () => {};
  const resolver = () =>
    new Promise<string>((r) => {
      resolve = r;
    });
  const { result, rerender } = renderHook(
    ({ key }: { key: string }) =>
      useMediaRecovery({ assetKey: key, resolveVideoUrl: resolver }),
    { initialProps: { key: 'one' } },
  );
  await act(async () => {
    resolve('first');
  });
  expect(result.current.videoUrl).toBe('first');
  rerender({ key: 'two' });
  expect(result.current.videoUrl).toBeNull();
  await act(async () => {
    resolve('second');
  });
  expect(result.current.videoUrl).toBe('second');
});

it('retries captions without interrupting a playable video', async () => {
  jest.useFakeTimers();
  const resolveVideoUrl = jest
    .fn()
    .mockResolvedValueOnce('playing-video')
    .mockImplementation(() => new Promise(() => {}));
  const resolveCaptions = jest
    .fn()
    .mockRejectedValueOnce(new Error('caption offline'))
    .mockResolvedValue('captions recovered');
  const { result, unmount } = renderHook(() =>
    useMediaRecovery({ assetKey: 'video', resolveVideoUrl, resolveCaptions }),
  );
  await act(async () => {});
  expect(result.current.playbackStatus).toBe('ready');
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(result.current.playbackStatus).toBe('ready');
  expect(result.current.captions).toBe('captions recovered');
  unmount();
  jest.useRealTimers();
});
