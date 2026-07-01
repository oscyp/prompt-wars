import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
  type AudioStatus,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import { isSoundEnabled } from '@/utils/soundSettings';
import {
  getMoveStingSource,
  getMusicTrackSource,
} from '@/constants/RevealAudio';
import type { RevealSpec } from '@/components/RoundResultCinematic';

/**
 * Best-effort Tier 0 reveal audio.
 *
 * Plays a short move-type / music sting, then speaks the winner's battle cry
 * (a pre-rendered TTS asset if the payload carries one, else on-device
 * `expo-speech`). Everything is fire-and-forget: it NEVER blocks or delays the
 * visual reveal, never surfaces errors, and fully stops + releases on unmount.
 *
 * Gating:
 *   - Respects the global "Sound & Music" setting (utils/soundSettings). If OFF,
 *     nothing plays — including speech.
 *   - The audio session is configured so SFX follow the iOS silent switch
 *     (`playsInSilentMode: false`) and mix with the user's background music
 *     (`interruptionMode: 'mixWithOthers'`) instead of pausing it.
 *
 * This is independent of Reduce Motion (audio is not motion); it is gated only on
 * the Sound setting and kept short and tasteful (no indefinite loops).
 */

const STING_VOLUME = 0.7;
const VOICE_VOLUME = 1.0;
/** Small gap so the sting lands before the voice line (avoids cacophony). */
const STING_TO_VOICE_GAP_MS = 500;
/** Safety caps so a stuck asset can never keep a player alive indefinitely. */
const STING_MAX_MS = 6000;
const VOICE_MAX_MS = 9000;
/** Slightly measured delivery for a dramatic cry. */
const SPEECH_RATE = 0.95;
const SPEECH_PITCH = 1.0;

export interface RevealAudioInput {
  /** Typed reveal spec from the Tier 0 payload (carries the audio ids + voice). */
  reveal_spec?: RevealSpec | null;
  /** Flat winner-cry fallback when `reveal_spec.battle_cry_voice.text` is absent. */
  battleCryText?: string | null;
}

export interface RevealAudioController {
  /** Fire the reveal audio once. Non-blocking; safe to call even when sound is off. */
  play: (input: RevealAudioInput) => void;
  /** Stop all playback + speech and release players. Auto-called on unmount. */
  stop: () => void;
}

type Subscription = { remove: () => void };

interface AudioCtx {
  players: AudioPlayer[];
  subs: Subscription[];
  timers: ReturnType<typeof setTimeout>[];
  mounted: boolean;
}

// Configure the shared audio session once per app session (best-effort).
let audioSessionReady = false;
function ensureAudioSession(): void {
  if (audioSessionReady) return;
  setAudioModeAsync({
    playsInSilentMode: false, // SFX obey the iOS mute switch
    interruptionMode: 'mixWithOthers', // do not pause the user's music
    shouldPlayInBackground: false,
  })
    .then(() => {
      audioSessionReady = true;
    })
    .catch(() => {
      // Leave the flag false so we retry on the next reveal.
    });
}

function releasePlayer(ctx: AudioCtx, player: AudioPlayer): void {
  try {
    player.remove();
  } catch {
    // Already removed / native gone — ignore.
  }
  ctx.players = ctx.players.filter((p) => p !== player);
}

function spawnPlayer(
  ctx: AudioCtx,
  source: AudioSource,
  volume: number,
  maxMs: number,
): AudioPlayer | null {
  try {
    const player = createAudioPlayer(source);
    player.loop = false;
    player.volume = volume;
    ctx.players.push(player);

    const sub = player.addListener(
      'playbackStatusUpdate',
      (status: AudioStatus) => {
        if (status.didJustFinish) releasePlayer(ctx, player);
      },
    );
    ctx.subs.push(sub);

    player.play();

    const timer = setTimeout(() => releasePlayer(ctx, player), maxMs);
    ctx.timers.push(timer);

    return player;
  } catch {
    return null;
  }
}

function releaseAll(ctx: AudioCtx): void {
  try {
    Speech.stop();
  } catch {
    // ignore
  }
  ctx.timers.forEach((t) => clearTimeout(t));
  ctx.timers = [];
  ctx.subs.forEach((s) => {
    try {
      s.remove();
    } catch {
      // ignore
    }
  });
  ctx.subs = [];
  // Copy first: releasePlayer mutates ctx.players while iterating.
  [...ctx.players].forEach((p) => releasePlayer(ctx, p));
  ctx.players = [];
}

function speakVoiceLine(ctx: AudioCtx, input: RevealAudioInput): void {
  if (!ctx.mounted || !isSoundEnabled()) return;

  const voice = input.reveal_spec?.battle_cry_voice ?? null;
  const assetUrl = voice?.asset_url ?? null;

  // Prefer a pre-rendered TTS asset if the server ever provides one.
  if (assetUrl) {
    spawnPlayer(ctx, { uri: assetUrl }, VOICE_VOLUME, VOICE_MAX_MS);
    return;
  }

  const text = (voice?.text ?? input.battleCryText ?? '').trim();
  if (!text) return;

  try {
    Speech.speak(text, {
      language: 'en-US',
      rate: SPEECH_RATE,
      pitch: SPEECH_PITCH,
    });
  } catch {
    // Degrade to silence.
  }
}

function playReveal(ctx: AudioCtx, input: RevealAudioInput): void {
  if (!isSoundEnabled()) return;

  // Stop anything still playing from a previous reveal, then start fresh.
  releaseAll(ctx);
  ensureAudioSession();

  try {
    const spec = input.reveal_spec ?? null;
    const stingSource =
      getMoveStingSource(spec?.move_sting_id) ??
      getMusicTrackSource(spec?.music_track_id);

    let stingPlayed = false;
    if (stingSource != null) {
      stingPlayed =
        spawnPlayer(ctx, stingSource, STING_VOLUME, STING_MAX_MS) != null;
    }

    // Voice line after the sting (or immediately when no sting is shipped).
    const gap = stingPlayed ? STING_TO_VOICE_GAP_MS : 0;
    const timer = setTimeout(() => speakVoiceLine(ctx, input), gap);
    ctx.timers.push(timer);
  } catch {
    // Degrade to silence; never surface to the reveal.
  }
}

export function useRevealAudio(): RevealAudioController {
  const ctxRef = useRef<AudioCtx>({
    players: [],
    subs: [],
    timers: [],
    mounted: true,
  });

  useEffect(() => {
    const ctx = ctxRef.current;
    ctx.mounted = true;
    return () => {
      ctx.mounted = false;
      releaseAll(ctx);
    };
  }, []);

  const play = useCallback((input: RevealAudioInput) => {
    playReveal(ctxRef.current, input);
  }, []);

  const stop = useCallback(() => {
    releaseAll(ctxRef.current);
  }, []);

  return useMemo(() => ({ play, stop }), [play, stop]);
}
