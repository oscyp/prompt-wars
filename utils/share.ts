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
export async function shareResultCard(ref: RefObject<View | null>): Promise<boolean> {
  if (!ref.current) return false;

  const uri = await captureRef(ref as RefObject<View>, {
    format: 'png',
    quality: 0.95,
    result: 'tmpfile',
  });

  if (!(await Sharing.isAvailableAsync())) return false;

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Share your Prompt Wars result',
    UTI: 'public.png',
  });
  return true;
}

/** Download the cinematic video to cache and open the share sheet. */
export async function shareBattleVideo(videoUrl: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const target = `${FileSystem.cacheDirectory}prompt-wars-battle-${Date.now()}.mp4`;
  const { uri } = await FileSystem.downloadAsync(videoUrl, target);

  await Sharing.shareAsync(uri, {
    mimeType: 'video/mp4',
    dialogTitle: 'Share your Prompt Wars battle',
    UTI: 'public.movie',
  });
  return true;
}
