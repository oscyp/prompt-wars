import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  AccessibilityInfo,
  findNodeHandle,
} from 'react-native';
import { VideoView, type VideoPlayer } from 'expo-video';
import { GameText, GameButton, GamePanel } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';

function isReleasedPlayerError(error: unknown): boolean {
  const description =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /NativeSharedObjectNotFoundException|Unable to find the native shared object|Cannot use shared object that was already released/i.test(
    description,
  );
}

function pauseAndMutePlayer(player: VideoPlayer) {
  try {
    player.pause();
    player.muted = true;
  } catch (error) {
    // useVideoPlayer releases its native shared object from the parent hook.
    // Parent cleanup can therefore win the race with this child's cleanup.
    if (!isReleasedPlayerError(error)) throw error;
  }
}

export default function ResultMedia({
  videoUrl,
  player,
  playbackError,
  retry,
  status,
  revised,
  roundNumber,
}: {
  videoUrl: string | null;
  player: VideoPlayer;
  playbackError: unknown;
  retry: () => void;
  status: { title: string; body: string; tone: string } | null;
  revised: boolean;
  roundNumber: number | null;
}) {
  const colors = useThemedColors();
  const active = useBattlePresentationActive();
  const activeRef = useRef(active);
  activeRef.current = active;
  const currentPlayerRef = useRef(player);
  currentPlayerRef.current = player;
  const videoRef = useRef<VideoView>(null);
  const fullscreenTargetRef = useRef<VideoView | null>(null);
  const openerRef = useRef<View>(null);
  const openerHandleRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const openingRef = useRef(false);
  const requestedUrlRef = useRef<string | null>(null);
  const restoreFocusOnExitRef = useRef(false);
  const completedRef = useRef(false);
  const previousVideoUrlRef = useRef(videoUrl);
  const [opening, setOpening] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [presentationError, setPresentationError] = useState(false);

  const setOpenerRef = useCallback((node: View | null) => {
    if (openerRef.current !== node) openerHandleRef.current = null;
    openerRef.current = node;
  }, []);

  const dismissFullscreen = useCallback(() => {
    try {
      void (fullscreenTargetRef.current ?? videoRef.current)
        ?.exitFullscreen()
        .catch(() => {});
    } catch {
      // Best-effort native teardown can race the VideoView being released.
    }
  }, []);

  useEffect(() => {
    const ended = player.addListener('playToEnd', () => {
      completedRef.current = true;
    });
    return () => ended.remove();
  }, [player]);

  useEffect(() => {
    if (!active) {
      dismissFullscreen();
      openingRef.current = false;
      requestedUrlRef.current = null;
      restoreFocusOnExitRef.current = false;
      setOpening(false);
      pauseAndMutePlayer(player);
    }
  }, [active, dismissFullscreen, player]);

  useEffect(() => {
    if (previousVideoUrlRef.current === videoUrl) return;
    dismissFullscreen();
    previousVideoUrlRef.current = videoUrl;
    openingRef.current = false;
    requestedUrlRef.current = null;
    restoreFocusOnExitRef.current = false;
    setOpening(false);
    setPresentationError(false);
    pauseAndMutePlayer(player);
  }, [dismissFullscreen, player, videoUrl]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      dismissFullscreen();
      openingRef.current = false;
      requestedUrlRef.current = null;
      restoreFocusOnExitRef.current = false;
      pauseAndMutePlayer(player);
    };
  }, [dismissFullscreen, player]);

  const openFullscreen = useCallback(async () => {
    if (!videoUrl || !activeRef.current || openingRef.current) return;
    const fullscreenTarget = videoRef.current;
    if (!fullscreenTarget) return;
    openingRef.current = true;
    requestedUrlRef.current = videoUrl;
    fullscreenTargetRef.current = fullscreenTarget;
    restoreFocusOnExitRef.current = false;
    setOpening(true);
    setPresentationError(false);
    try {
      await fullscreenTarget.enterFullscreen();
    } catch {
      if (requestedUrlRef.current !== videoUrl) return;
      openingRef.current = false;
      requestedUrlRef.current = null;
      fullscreenTargetRef.current = null;
      openerHandleRef.current = null;
      setOpening(false);
      setPresentationError(true);
    }
  }, [videoUrl]);

  const handleFullscreenEnter = useCallback(() => {
    if (!mountedRef.current || currentPlayerRef.current !== player) {
      restoreFocusOnExitRef.current = false;
      dismissFullscreen();
      return;
    }
    // In this expo-video version `nativeControls={false}` also reaches the
    // fullscreen AVPlayerViewController. Enable them after native entry so a
    // completed or paused video always retains its system Close control.
    setFullscreen(true);
    if (
      !activeRef.current ||
      !videoUrl ||
      requestedUrlRef.current !== videoUrl
    ) {
      restoreFocusOnExitRef.current = false;
      dismissFullscreen();
      return;
    }
    restoreFocusOnExitRef.current = true;
    openingRef.current = false;
    setOpening(false);
    setPresentationError(false);
    try {
      if (completedRef.current) {
        player.currentTime = 0;
        completedRef.current = false;
      }
      // Only a requested native fullscreen entry may enable cinematic audio.
      // Keep the user's device/player volume unchanged.
      player.muted = false;
      player.play();
    } catch (error) {
      restoreFocusOnExitRef.current = false;
      requestedUrlRef.current = null;
      dismissFullscreen();
      pauseAndMutePlayer(player);
      if (!isReleasedPlayerError(error)) setPresentationError(true);
    }
  }, [dismissFullscreen, player, videoUrl]);

  const handleFullscreenExit = useCallback(() => {
    if (!mountedRef.current || currentPlayerRef.current !== player) return;
    const shouldRestoreFocus =
      restoreFocusOnExitRef.current && activeRef.current;
    restoreFocusOnExitRef.current = false;
    fullscreenTargetRef.current = null;
    setFullscreen(false);
    openingRef.current = false;
    requestedUrlRef.current = null;
    setOpening(false);
    pauseAndMutePlayer(player);
    if (shouldRestoreFocus) {
      const mountedOpener = openerRef.current;
      const target =
        (mountedOpener && findNodeHandle(mountedOpener)) ??
        openerHandleRef.current;
      if (target) AccessibilityInfo.setAccessibilityFocus(target);
    }
  }, [player]);

  if (!videoUrl && !status && !playbackError) return null;

  return (
    <GamePanel style={{ gap: 12 }}>
      {!videoUrl && !status && playbackError ? (
        <GameText variant="label" accessibilityRole="header">
          Cinematic
        </GameText>
      ) : null}
      {videoUrl ? (
        <View style={{ gap: 12 }}>
          {revised ? (
            <GameText variant="caption" style={{ color: colors.warning }}>
              Before review
            </GameText>
          ) : null}
          <View
            testID="cinematic-preview"
            style={{
              height: 220,
              overflow: 'hidden',
              backgroundColor: '#000',
              justifyContent: 'center',
            }}
          >
            <VideoView
              ref={videoRef}
              player={player}
              accessibilityLabel={
                roundNumber
                  ? `Round ${roundNumber} cinematic`
                  : 'Battle cinematic'
              }
              style={{ width: '100%', height: '100%' }}
              nativeControls={fullscreen}
              contentFit="contain"
              onFullscreenEnter={handleFullscreenEnter}
              onFullscreenExit={handleFullscreenExit}
            />
            {!presentationError ? (
              <View
                pointerEvents="box-none"
                style={{
                  ...ReactNativeAbsoluteFill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <GameButton
                  ref={setOpenerRef}
                  label="Play cinematic"
                  icon="play-outline"
                  tone="secondary"
                  busy={opening}
                  onLayout={(event) => {
                    if (typeof event.currentTarget === 'number') {
                      openerHandleRef.current = event.currentTarget;
                    }
                  }}
                  onPress={(event) => {
                    if (typeof event?.currentTarget === 'number') {
                      openerHandleRef.current = event.currentTarget;
                    }
                    void openFullscreen();
                  }}
                />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
      {status ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <GameText variant="label" accessibilityRole="header">
            {status.title}
          </GameText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {status.tone === 'pending' ? (
              <ActivityIndicator
                color={colors.textSecondary}
                accessible={false}
              />
            ) : null}
            <GameText style={{ flex: 1 }}>{status.body}</GameText>
          </View>
        </View>
      ) : null}
      {playbackError ? (
        <View style={{ gap: 8 }}>
          <GameText>
            Your cinematic is generated, but playback is unavailable.
          </GameText>
          <GameButton
            label="Retry loading media"
            tone="secondary"
            onPress={retry}
          />
        </View>
      ) : null}
      {presentationError ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <GameText>Couldn’t open the cinematic.</GameText>
          <GameButton
            label="Retry opening cinematic"
            tone="secondary"
            onPress={() => void openFullscreen()}
          />
        </View>
      ) : null}
    </GamePanel>
  );
}

const ReactNativeAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
