import { useCallback, useMemo, useRef } from 'react';
import type { View } from 'react-native';

export type SheetFocusRef = React.RefObject<View | null>;

/** Keep the ref, not its native handle: async work can recreate the opener. */
export function useSheetReturnFocus(fallback?: SheetFocusRef) {
  const opener = useRef<SheetFocusRef | null>(null);
  const remember = useCallback((ref: SheetFocusRef) => {
    opener.current = ref;
  }, []);
  const returnFocusRef = useMemo(
    () => ({
      get current() {
        return opener.current?.current ?? fallback?.current ?? null;
      },
    }),
    [fallback],
  );
  return { remember, returnFocusRef };
}
