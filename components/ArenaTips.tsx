import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { Motion, Spacing, Typography } from '@/constants/DesignTokens';
import { TIP_INTERVAL_MS, tipForTick } from '@/utils/arenaTips';

export interface ArenaTipsProps {
  /** Offsets the rotation so consecutive visits do not open on the same tip. */
  seed?: number;
  reduceMotion: boolean;
  /**
   * Whether a screen reader is running. When omitted the component asks the
   * OS itself; pass it when the screen already knows.
   */
  screenReader?: boolean;
}

/** Two lines of `sm` text; the box never shrinks below this, so the layout
 *  around it does not jump when a one-line tip follows a two-line one. */
const LINE_HEIGHT = 20;
const MIN_HEIGHT = LINE_HEIGHT * 2;

function useScreenReaderEnabled(override: boolean | undefined): boolean {
  const [detected, setDetected] = useState(false);
  useEffect(() => {
    if (override !== undefined) return;
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (mounted) setDetected(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setDetected,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [override]);
  return override ?? detected;
}

/**
 * One arena tip on the fixed-dark scrim, rotating every `TIP_INTERVAL_MS`
 * with a cross-fade.
 *
 * Under Reduce Motion, or with a screen reader running, the first tip stays
 * put: a line that changes on a timer is a live region talking over VoiceOver,
 * and a cross-fade is motion. The text is white on the scrim (design language
 * §3/§7), not the themed ink, because the scrim does not change with the theme.
 */
export default function ArenaTips({
  seed = 0,
  reduceMotion,
  screenReader,
}: ArenaTipsProps) {
  const screenReaderOn = useScreenReaderEnabled(screenReader);
  const isStatic = reduceMotion || screenReaderOn;

  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);
  // The line fading out while `tick`'s line fades in. Null once the fade ends
  // (or whenever rotation is off), so a static reader sees exactly one Text.
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isStatic) {
      setOutgoing(null);
      progress.setValue(1);
      return;
    }
    const id = setInterval(() => {
      const previous = tickRef.current;
      tickRef.current = previous + 1;
      // Reset before the state lands so the incoming line's first frame is
      // already transparent; setting it afterwards flashes the new tip once
      // at full opacity before the fade starts.
      progress.setValue(0);
      setOutgoing(tipForTick(previous, seed));
      setTick(previous + 1);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isStatic, seed, progress]);

  useEffect(() => {
    if (outgoing === null) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: Motion.durations.slow,
      easing: Easing.bezier(...Motion.easing.standard),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) setOutgoing(null);
    });
    return () => anim.stop();
  }, [outgoing, tick, progress]);

  const tip = tipForTick(tick, seed);
  const outgoingOpacity = Animated.subtract(1, progress);

  return (
    <View
      style={styles.box}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Tip: ${tip}`}
    >
      {outgoing !== null ? (
        <Animated.Text
          style={[styles.tip, styles.outgoing, { opacity: outgoingOpacity }]}
          numberOfLines={3}
        >
          {outgoing}
        </Animated.Text>
      ) : null}
      <Animated.Text
        style={[styles.tip, { opacity: progress }]}
        numberOfLines={3}
      >
        {tip}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    minHeight: MIN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  tip: {
    fontSize: Typography.sizes.sm,
    lineHeight: LINE_HEIGHT,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  outgoing: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
  },
});
