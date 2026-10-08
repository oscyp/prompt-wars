import { useState } from 'react';
import {
  Image,
  Pressable,
  View,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { GamePanel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';
import type { SheetFocusRef } from '@/hooks/useSheetReturnFocus';
import { traitOptions, type TraitOptionKey } from '@/utils/traitOptions';
import { TRAIT_PREVIEW_ART } from '@/constants/TraitPreviewArt';
import BottomSheet from '@/components/sheets/BottomSheet';

type Group = Exclude<TraitOptionKey, 'itemClass'>;
export default function TraitChoiceSheet({
  group,
  title,
  visible,
  value,
  disabled,
  onChoose,
  onClose,
  returnFocusRef,
}: {
  group: Group;
  title: string;
  visible: boolean;
  value: string | null;
  disabled?: boolean;
  onChoose: (value: string) => void;
  onClose: () => void;
  returnFocusRef?: SheetFocusRef;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeButtonLabel="Close"
      fixedHeading
      showHandle={false}
      subtitle="Visual references — your drawing will vary."
      closeAccessibilityLabel={`Close ${title} choices`}
      returnFocusRef={returnFocusRef}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'space-between',
          paddingTop: 12,
        }}
      >
        {traitOptions(group).map((option) => {
          const key = `${group}:${option.value}`;
          const art = TRAIT_PREVIEW_ART[group]?.[option.value];
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={`${title}: ${option.label}`}
              accessibilityHint={option.description}
              accessibilityState={{
                selected: value === option.value,
                disabled,
              }}
              disabled={disabled}
              onPress={() => {
                if (!disabled) onChoose(option.value);
              }}
              style={{
                width: width >= 390 && fontScale <= 1.15 ? '48%' : '100%',
              }}
            >
              <GamePanel
                tone={value === option.value ? 'selected' : 'quiet'}
                style={{ gap: 8 }}
              >
                <View
                  testID={`trait-reference-frame-${key}`}
                  style={{
                    width: '100%',
                    aspectRatio: 1,
                    overflow: 'hidden',
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.background,
                  }}
                >
                  {art && !failed[key] ? (
                    <Image
                      testID={`trait-reference-art-${key}`}
                      source={art}
                      resizeMode="cover"
                      accessible={false}
                      onError={() =>
                        setFailed((old) => ({ ...old, [key]: true }))
                      }
                      style={[
                        StyleSheet.absoluteFillObject,
                        { width: '100%', height: '100%' },
                      ]}
                    />
                  ) : (
                    <GameIcon
                      name="profile"
                      size={64}
                      color={colors.ornamentMuted}
                    />
                  )}
                </View>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <GameText
                    variant="fighter"
                    style={{ flex: 1, fontSize: 22, lineHeight: 28 }}
                  >
                    {option.label}
                  </GameText>
                  {value === option.value && (
                    <GameIcon name="check" color={colors.primary} />
                  )}
                </View>
                <GameText
                  variant="caption"
                  style={{ color: colors.textSecondary }}
                >
                  {option.description}
                </GameText>
              </GamePanel>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}
