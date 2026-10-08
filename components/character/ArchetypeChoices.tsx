import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ARCHETYPE_LIST,
  ARCHETYPE_ART,
  type ArchetypeId,
} from '@/constants/Archetypes';
import { GamePanel, GameText } from '@/components/game';
import { GameIcon } from '@/components/game/icons/GameIcon';
import { useThemedColors } from '@/hooks/useThemedColors';

/** Pure preset presentation shared by creation and editing; no pricing or cooldown policy. */
export default function ArchetypeChoices({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: {
  value: ArchetypeId | null;
  onChange: (value: ArchetypeId) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const colors = useThemedColors();
  const { width, fontScale } = useWindowDimensions();
  return (
    <View
      style={{
        gap: 12,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
      }}
    >
      {ARCHETYPE_LIST.map((arch) => (
        <Pressable
          key={arch.id}
          style={{ width: width >= 700 && fontScale <= 1.15 ? '48%' : '100%' }}
          accessibilityRole="radio"
          accessibilityLabel={`Archetype: ${arch.name}`}
          accessibilityHint={
            disabledReason ?? `${arch.description}. Trait: ${arch.trait}`
          }
          accessibilityState={{ selected: value === arch.id, disabled }}
          disabled={disabled}
          onPress={() => {
            if (!disabled) onChange(arch.id);
          }}
        >
          <GamePanel
            tone={value === arch.id ? 'selected' : 'quiet'}
            style={{ gap: 8 }}
          >
            <View
              style={{ width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' }}
            >
              <Image
                source={ARCHETYPE_ART[arch.id]}
                style={[
                  StyleSheet.absoluteFill,
                  { width: '100%', height: '100%' },
                ]}
                resizeMode="contain"
                accessible={false}
              />
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <GameText variant="fighter" style={{ flex: 1 }}>
                {arch.name}
              </GameText>
              {value === arch.id && (
                <GameIcon name="check" color={colors.primary} />
              )}
            </View>
            <GameText style={{ color: colors.textSecondary }}>
              {arch.description}
            </GameText>
            <GameText variant="caption" style={{ color: colors.textSecondary }}>
              Trait: {arch.trait}
            </GameText>
          </GamePanel>
        </Pressable>
      ))}
    </View>
  );
}
