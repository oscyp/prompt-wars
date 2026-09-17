import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { CosmeticType } from '@/utils/cosmetics';

export const SHOP_CATEGORIES: { type: CosmeticType; label: string }[] = [
  { type: 'frame', label: 'Frames' },
  { type: 'title', label: 'Titles' },
  { type: 'avatar_effect', label: 'Auras' },
  { type: 'badge', label: 'Badges' },
  { type: 'color', label: 'Colours' },
];

/** Measure native labels instead of guessing whether five complete words fit. */
export function ShopCategoryTabs({
  value,
  onChange,
}: {
  value: CosmeticType;
  onChange: (value: CosmeticType) => void;
}) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const positions = useRef<Record<string, { x: number; width: number }>>({});
  const complete = SHOP_CATEGORIES.every(
    ({ type }) => labelWidths[type] !== undefined,
  );
  const fits =
    complete &&
    SHOP_CATEGORIES.reduce(
      (sum, { type }) => sum + Math.max(48, labelWidths[type] + 16),
      0,
    ) <= width;
  const reveal = useCallback(() => {
    const selected = positions.current[value];
    if (selected && width)
      scroll.current?.scrollTo({
        x: Math.max(0, selected.x - (width - selected.width) / 2),
        animated: true,
      });
  }, [value, width]);
  useEffect(() => {
    reveal();
  }, [reveal, fontScale, fits]);
  return (
    <ScrollView
      ref={scroll}
      testID="shop-category-scroll"
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onContentSizeChange={reveal}
      contentContainerStyle={styles.content}
      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View
        accessibilityRole="tablist"
        style={[styles.rail, fits && { minWidth: width }]}
      >
        {SHOP_CATEGORIES.map(({ type, label }) => (
          <Pressable
            key={type}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: value === type }}
            onPress={() => onChange(type)}
            onLayout={(event) => {
              positions.current[type] = event.nativeEvent.layout;
              if (type === value) reveal();
            }}
            style={[
              styles.tab,
              fits && { flexGrow: 1 },
              {
                borderBottomColor:
                  value === type ? colors.primary : 'transparent',
              },
            ]}
          >
            <GameText
              variant="label"
              onLayout={(event) => {
                const measured = event.nativeEvent.layout.width;
                setLabelWidths((old) =>
                  old[type] === measured ? old : { ...old, [type]: measured },
                );
              }}
              style={{
                color: value === type ? colors.text : colors.textSecondary,
              }}
            >
              {label}
            </GameText>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  rail: { flexDirection: 'row' },
  tab: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
  },
});
