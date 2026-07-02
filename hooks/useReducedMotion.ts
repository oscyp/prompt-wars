import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  isReducedMotionForced,
  subscribeAccessibility,
} from '@/utils/accessibilitySettings';

/**
 * Centralizes the `AccessibilityInfo.isReduceMotionEnabled()` pattern used
 * across the app (e.g. FaceOffPortraits, HPBar, the battle reveal) into a
 * single reactive hook.
 *
 * The returned value is the OR of the OS "Reduce Motion" setting and the app's
 * own persisted "Reduce Motion" toggle (Settings → Accessibility). Either one
 * being on yields a static/instant path, so users on a device without OS
 * reduce-motion can still opt out of animation in-app.
 *
 * Every new animation should gate on this. The OS value is cached at module
 * scope so components mounted later (e.g. the battle reveal) get the correct
 * value synchronously on first render and never flash motion.
 */
let cachedReduceMotion: boolean | null = null;

export function useReducedMotion(): boolean {
  const [osReduceMotion, setOsReduceMotion] = useState<boolean>(
    cachedReduceMotion ?? false,
  );
  const [forced, setForced] = useState<boolean>(isReducedMotionForced());

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        cachedReduceMotion = enabled;
        if (mounted) setOsReduceMotion(enabled);
      })
      .catch(() => {
        // If the query fails, keep motion enabled (safe visual default).
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        cachedReduceMotion = enabled;
        setOsReduceMotion(enabled);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // Track the app's manual "Reduce Motion" preference reactively so flipping
  // the Settings toggle updates in-flight and future reveals immediately.
  useEffect(() => {
    setForced(isReducedMotionForced());
    return subscribeAccessibility((p) => setForced(p.reducedMotion));
  }, []);

  return osReduceMotion || forced;
}
