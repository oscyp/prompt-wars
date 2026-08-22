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

/**
 * Download the cinematic video to cache and open the share sheet.
 *
 * AI disclosure: the on-screen reveal and the exported result card both carry a
 * visible "AI-GENERATED" label, but the video file itself does not — the video
 * prompt explicitly instructs the provider to render no text overlays
 * (_shared/providers.ts), and re-encoding a burn-in on-device is not viable.
 *
 * Until the label is composited server-side during the storage copy in
 * process-video-job, the disclosure rides on the filename and the share-sheet
 * title, which is what most targets surface. Do not describe this as a
 * watermark: it is not one, and landing/index.html should not claim otherwise.
 */
export async function shareBattleVideo(videoUrl: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const target = `${FileSystem.cacheDirectory}prompt-wars-ai-generated-battle-${Date.now()}.mp4`;
  const { uri } = await FileSystem.downloadAsync(videoUrl, target);

  await Sharing.shareAsync(uri, {
    mimeType: 'video/mp4',
    dialogTitle: 'Share your AI-generated Prompt Wars battle',
    UTI: 'public.movie',
  });
  return true;
}
