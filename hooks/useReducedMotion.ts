import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Centralizes the `AccessibilityInfo.isReduceMotionEnabled()` pattern used
 * across the app (e.g. FaceOffPortraits, HPBar) into a single reactive hook.
 *
 * Every new animation should gate on this so a static/instant path is used
 * when the OS "Reduce Motion" setting is on. The resolved value is cached at
 * module scope so components mounted later (e.g. the battle reveal) get the
 * correct value synchronously on first render and never flash motion.
 */
let cachedReduceMotion: boolean | null = null;

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState<boolean>(
    cachedReduceMotion ?? false,
  );

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        cachedReduceMotion = enabled;
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // If the query fails, keep motion enabled (safe visual default).
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        cachedReduceMotion = enabled;
        setReduceMotion(enabled);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
