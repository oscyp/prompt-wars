// Moderation Tests
// Tests for text and video moderation logic

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { TextModerationProvider, VideoModerationProvider } from '../_shared/moderation.ts';

Deno.test('TextModerationProvider - blocklist rejection', async () => {
  const moderator = new TextModerationProvider();
  
  const result = await moderator.moderate('This is spam content');
  
  assertEquals(result.status, 'rejected');
  assertEquals(result.reason, 'Blocked term detected');
  assertExists(result.confidence);
  assertEquals(result.confidence, 1.0);
});

Deno.test('TextModerationProvider - length validation too short', async () => {
  const moderator = new TextModerationProvider();
  
  const result = await moderator.moderate('short');
  
  assertEquals(result.status, 'rejected');
  assertEquals(result.reason, 'Prompt length out of bounds (20-800 chars)');
});

Deno.test('TextModerationProvider - length validation too long', async () => {
  const moderator = new TextModerationProvider();
  
  const longText = 'a'.repeat(801);
  const result = await moderator.moderate(longText);
  
  assertEquals(result.status, 'rejected');
  assertEquals(result.reason, 'Prompt length out of bounds (20-800 chars)');
});

Deno.test('TextModerationProvider - excessive caps flagged', async () => {
  const moderator = new TextModerationProvider();
  
  const result = await moderator.moderate('THIS IS ALL CAPS AND VERY LONG TEXT TO TRIGGER THE HEURISTIC');
  
  assertEquals(result.status, 'flagged_human_review');
  assertEquals(result.reason, 'Excessive capitalization');
});

Deno.test('TextModerationProvider - excessive repetition flagged', async () => {
  const moderator = new TextModerationProvider();
  
  const result = await moderator.moderate(
    'word word word word word word word word word word word word'
  );
  
  assertEquals(result.status, 'flagged_human_review');
  assertEquals(result.reason, 'Excessive repetition');
});

Deno.test('TextModerationProvider - clean text approved', async () => {
  const moderator = new TextModerationProvider();
  
  const result = await moderator.moderate(
    'A heroic knight charges into battle with a gleaming sword and unwavering courage.'
  );
  
  assertEquals(result.status, 'approved');
  assertExists(result.confidence);
  assertEquals(result.provider, 'blocklist');
});

Deno.test('TextModerationProvider - multiple violations', async () => {
  const moderator = new TextModerationProvider();
  
  const result = await moderator.moderate('spam kill die nsfw');
  
  assertEquals(result.status, 'rejected');
  assertEquals(result.reason, 'Blocked term detected');
});

Deno.test('VideoModerationProvider - manual review default', async () => {
  const moderator = new VideoModerationProvider();
  
  const result = await moderator.moderate('https://example.com/video.mp4', 'test-video-id');
  
  assertEquals(result.status, 'flagged_human_review');
  assertExists(result.reason);
  assertEquals(result.provider, 'manual');
});

Deno.test('VideoModerationProvider - no provider configured', async () => {
  // Set env to trigger "none" provider
  const originalProvider = Deno.env.get('VIDEO_MODERATION_PROVIDER');
  Deno.env.set('VIDEO_MODERATION_PROVIDER', 'none');
  
  const moderator = new VideoModerationProvider();
  const result = await moderator.moderate('https://example.com/video.mp4', 'test-video-id');
  
  assertEquals(result.status, 'flagged_human_review');
  assertEquals(result.provider, 'none');
  
  // Restore
  if (originalProvider) {
    Deno.env.set('VIDEO_MODERATION_PROVIDER', originalProvider);
  } else {
    Deno.env.delete('VIDEO_MODERATION_PROVIDER');
  }
});
