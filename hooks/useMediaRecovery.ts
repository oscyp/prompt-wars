import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

export interface MediaRecoveryOptions<T = string> {
  /** Include account, battle, round and asset revision; never just a signed URL. */
  assetKey: string | null;
  resolveVideoUrl: () => Promise<string | null>;
  resolveCaptions?: () => Promise<T | null>;
  enabled?: boolean;
}

/** Only reads existing assets. Does not generate jobs, spend, or bypass moderation. */
export function useMediaRecovery<T = string>({
  assetKey,
  resolveVideoUrl,
  resolveCaptions,
  enabled = true,
}: MediaRecoveryOptions<T>) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<T | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const generation = useRef(0);
  const resolvers = useRef({ resolveVideoUrl, resolveCaptions });
  resolvers.current = { resolveVideoUrl, resolveCaptions };
  const errorText = (error: unknown) =>
    error instanceof Error ? error.message : 'Could not load media';

  const retry = useCallback(async () => {
    if (!assetKey || !enabled) return;
    const request = ++generation.current;
    setPlaybackStatus('loading');
    setPlaybackError(null);
    await Promise.all([
      resolvers.current
        .resolveVideoUrl()
        .then((url) => {
          if (request !== generation.current) return;
          if (!url) throw new Error('Video link unavailable. Try again.');
          setVideoUrl(url);
          setPlaybackStatus('ready');
        })
        .catch((error) => {
          if (request !== generation.current) return;
          setVideoUrl(null);
          setPlaybackError(errorText(error));
          setPlaybackStatus('error');
        }),
      (resolvers.current.resolveCaptions?.() ?? Promise.resolve(null))
        .then((value) => {
          if (request !== generation.current) return;
          setCaptions(value);
          setCaptionError(null);
        })
        .catch((error) => {
          if (request !== generation.current) return;
          setCaptions(null);
          setCaptionError(errorText(error));
        }),
    ]);
  }, [assetKey, enabled]);

  useEffect(() => {
    setVideoUrl(null);
    setCaptions(null);
    setCaptionError(null);
    setPlaybackError(null);
    setPlaybackStatus('idle');
    void retry();
    return () => {
      generation.current += 1;
    };
  }, [retry]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void retry();
    });
    // Browsers expose connectivity directly. Native has no installed network
    // module: retry failed reads while foregrounded to recover after reconnect.
    const online = () => {
      void retry();
    };
    if (Platform.OS === 'web') globalThis.addEventListener?.('online', online);
    return () => {
      subscription.remove();
      if (Platform.OS === 'web')
        globalThis.removeEventListener?.('online', online);
    };
  }, [retry]);

  const retryCaptions = useCallback(async () => {
    if (!assetKey || !enabled) return;
    const request = generation.current;
    try {
      const value = await resolvers.current.resolveCaptions?.();
      if (request !== generation.current) return;
      setCaptions(value ?? null);
      setCaptionError(null);
    } catch (error) {
      if (request === generation.current) setCaptionError(errorText(error));
    }
  }, [assetKey, enabled]);

  useEffect(() => {
    if (playbackStatus !== 'error' && !captionError) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background') {
        if (playbackStatus === 'error') void retry();
        else void retryCaptions();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [playbackStatus, captionError, retry, retryCaptions]);

  const reportPlaybackError = useCallback((error?: unknown) => {
    setPlaybackError(
      error ? errorText(error) : 'Playback interrupted. Try again.',
    );
    setPlaybackStatus('error');
  }, []);
  return {
    videoUrl,
    playbackStatus,
    playbackError,
    captions,
    captionError,
    retry,
    retryCaptions,
    reportPlaybackError,
  };
}
