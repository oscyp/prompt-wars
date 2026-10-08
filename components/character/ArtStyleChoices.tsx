import React, { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ART_STYLES,
  ART_STYLE_LABELS,
  ART_STYLE_THUMBS,
  type ArtStyle,
} from '@/constants/CharacterTraits';
import { GameButton, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import BottomSheet from '@/components/sheets/BottomSheet';
export default function ArtStyleChoices({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: ArtStyle;
  onChange: (value: ArtStyle) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(width - 32);
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const featured = Array.from(
    new Set([value, 'comic', 'painterly', 'anime'] as ArtStyle[]),
  ).slice(0, 3);
  const tiles = (all: boolean) => (
    <View
      style={styles.grid}
      onLayout={(event) => {
        if (!all) setAvailableWidth(event.nativeEvent.layout.width);
      }}
    >
      {(all ? ART_STYLES : featured).map((key) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Art style: ${ART_STYLE_LABELS[key]}`}
          accessibilityState={{ selected: key === value, disabled }}
          disabled={disabled}
          onPress={() => {
            if (disabled) return;
            onChange(key);
            setOpen(false);
          }}
          style={[
            styles.tile,
            {
              width:
                fontScale > 1.3
                  ? '100%'
                  : all || availableWidth < 3 * 96 * fontScale + 16
                    ? '48%'
                    : '31%',
              borderColor: key === value ? colors.ornament : colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <View
            style={styles.image}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Image
              source={ART_STYLE_THUMBS[key]}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessible={false}
            />
          </View>
          {key === value && (
            <View style={[styles.check, { backgroundColor: colors.ornament }]}>
              <GameIcon name="check" size={16} color={colors.actionInk} />
            </View>
          )}
          <GameText
            variant="label"
            style={{ fontSize: 16, textAlign: 'center', padding: 5 }}
          >
            {ART_STYLE_LABELS[key]}
          </GameText>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {compact ? (
        <Pressable
          ref={opener}
          accessibilityRole="button"
          accessibilityLabel={`View art styles, ${ART_STYLE_LABELS[value]}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(true)}
          style={[
            styles.compact,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Image
            source={ART_STYLE_THUMBS[value]}
            style={styles.thumbnail}
            accessible={false}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <GameText
              variant="fighter"
              style={{
                fontSize: 16,
                color: colors.primary,
                letterSpacing: 0.8,
              }}
            >
              ART STYLE
            </GameText>
            <GameText variant="label">{ART_STYLE_LABELS[value]}</GameText>
          </View>
          <GameIcon name="chevron-right" size={18} color={colors.primary} />
        </Pressable>
      ) : (
        <View style={styles.heading}>
          <GameText
            variant="fighter"
            accessibilityRole="header"
            style={{ fontSize: 19, color: colors.primary, letterSpacing: 0.8 }}
          >
            ART STYLE
          </GameText>
          <GameButton
            ref={opener}
            label="View all styles"
            chrome="text"
            tone="secondary"
            endIcon="chevron-right"
            onPress={() => setOpen(true)}
            labelStyle={{ fontSize: 16, textDecorationLine: 'none' }}
          />
        </View>
      )}
      {!compact && tiles(false)}
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Art style"
        closeAccessibilityLabel="Close art styles"
        returnFocusRef={opener}
        footer={<GameButton label="Done" onPress={() => setOpen(false)} />}
      >
        {tiles(true)}
      </BottomSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  compact: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderRadius: 4,
  },
  thumbnail: { width: 44, height: 48, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderWidth: 1, padding: 3, minHeight: 100 },
  image: { width: '100%', aspectRatio: 1.5 },
  check: {
    position: 'absolute',
    right: 5,
    top: 5,
    padding: 3,
    borderRadius: 12,
  },
});
