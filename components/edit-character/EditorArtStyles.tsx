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
export default function EditorArtStyles({
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
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const featured = Array.from(
    new Set([value, 'comic', 'painterly', 'anime'] as ArtStyle[]),
  ).slice(0, 3);
  const tiles = (all: boolean) => (
    <View style={styles.grid}>
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
              width: all
                ? fontScale > 1.3
                  ? '100%'
                  : '48%'
                : fontScale > 1.3
                  ? '48%'
                  : '31%',
              borderColor: key === value ? colors.ornament : colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <Image
            source={ART_STYLE_THUMBS[key]}
            style={styles.image}
            resizeMode="cover"
            accessible={false}
          />
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
      <View style={styles.heading}>
        <GameText variant="title" style={{ fontSize: 22 }}>
          Art style
        </GameText>
        <GameButton
          ref={opener}
          label={compact ? ART_STYLE_LABELS[value] : 'View all styles'}
          chrome="text"
          tone="secondary"
          endIcon="chevron-right"
          onPress={() => setOpen(true)}
          labelStyle={{ fontSize: 16 }}
        />
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderWidth: 1, padding: 3, minHeight: 100 },
  image: { width: '100%', height: 65 },
  check: {
    position: 'absolute',
    right: 5,
    top: 5,
    padding: 3,
    borderRadius: 12,
  },
});
