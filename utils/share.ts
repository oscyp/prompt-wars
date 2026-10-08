// Share helpers for the result reveal: scored result-card image export (works
// for every battle, Tier 0 included) and the watermarked cinematic video.
//
// The card is captured from a rendered view via react-native-view-shot; the
// video is downloaded from Supabase storage to a local cache file because
// expo-sharing can only share local file URIs. Callers handle user-facing
// errors; these helpers return false when sharing is unavailable.

import { RefObject } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

/** Capture the scored result card to a PNG and open the share sheet. */
export async function shareResultCard(
  ref: RefObject<View | null>,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (!ref.current) return false;
  const assertCurrent = () => {
    if (!isCurrent())
      throw new Error(
        'The result changed. Review the updated card and share again.',
      );
  };
  assertCurrent();

  const uri = await captureRef(ref as RefObject<View>, {
    format: 'png',
    quality: 0.95,
    result: 'tmpfile',
  });
  assertCurrent();

  if (!(await Sharing.isAvailableAsync())) return false;
  assertCurrent();

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Share your Prompt Wars result',
    UTI: 'public.png',
  });
  return true;
}

/** Download the cinematic video to cache and open the share sheet. */
export async function shareBattleVideo(
  videoUrl: string,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const assertCurrent = () => {
    if (!isCurrent())
      throw new Error(
        'The result changed. Review the updated result and share again.',
      );
  };
  assertCurrent();
  if (!(await Sharing.isAvailableAsync())) return false;
  assertCurrent();

  const target = `${FileSystem.cacheDirectory}prompt-wars-battle-${Date.now()}.mp4`;
  const { uri } = await FileSystem.downloadAsync(videoUrl, target);
  assertCurrent();

  await Sharing.shareAsync(uri, {
    mimeType: 'video/mp4',
    dialogTitle: 'Share your Prompt Wars battle',
    UTI: 'public.movie',
  });
  return true;
}
