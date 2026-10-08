import { useCallback, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { heroArtworkBudget } from '@/utils/heroArtworkLayout';

/** Measure only non-art content, so changing artwork size cannot feed back into its budget. */
export function useHeroArtworkBudget(
  reservedInsets: number,
  viewportHeight?: number,
  headerEstimate?: number,
) {
  const { height, fontScale } = useWindowDimensions();
  const [parts, setParts] = useState<Record<string, number>>({});
  const record = useCallback((key: string, value: number) => {
    setParts((previous) =>
      Math.abs((previous[key] ?? -1) - value) < 1
        ? previous
        : { ...previous, [key]: value },
    );
  }, []);
  const measure = (key: string) => (event: LayoutChangeEvent) =>
    record(key, event.nativeEvent.layout.height);
  const reserved =
    (parts.header ?? headerEstimate ?? 140 * fontScale) +
    (parts.card ?? 140 * fontScale) +
    (parts.actions ?? 64 * fontScale) +
    (parts.urgent ?? 0) +
    reservedInsets;
  return {
    maxArtworkHeight: heroArtworkBudget(
      viewportHeight ?? height - 90,
      reserved,
    ),
    measure,
    onCardBodyHeight: useCallback(
      (value: number) => record('card', value),
      [record],
    ),
  };
}
