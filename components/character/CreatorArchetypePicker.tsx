import React, { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import {
  ARCHETYPES,
  ARCHETYPE_ART,
  type ArchetypeId,
} from '@/constants/Archetypes';
import { GameButton, GamePanel, GameText } from '@/components/game';
import BottomSheet from '@/components/sheets/BottomSheet';
import ArchetypeChoices from './ArchetypeChoices';
import { hapticSelection } from '@/utils/haptics';

export default function CreatorArchetypePicker({
  value,
  onChange,
}: {
  value: ArchetypeId | null;
  onChange: (value: ArchetypeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  const selected = value ? ARCHETYPES[value] : null;
  return (
    <>
      <GamePanel style={{ gap: 12 }}>
        {value && selected ? (
          <>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Image
                source={ARCHETYPE_ART[value]}
                style={{ width: 64, height: 88 }}
                resizeMode="contain"
                accessible={false}
              />
              <GameText variant="fighter" style={{ flex: 1 }}>
                {selected.name}
              </GameText>
            </View>
            <GameText>{selected.description}</GameText>
          </>
        ) : (
          <GameText>Choose a free identity preset. No scoring bonus.</GameText>
        )}
        <GameButton
          ref={opener}
          label={selected ? 'Change archetype' : 'Choose archetype'}
          chrome="utility"
          gameIcon="mask"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(true)}
        />
      </GamePanel>
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        returnFocusRef={opener}
        title="Choose your archetype"
        closeAccessibilityLabel="Close archetypes"
        subtitle="All presets are free."
        footer={<GameButton label="Done" onPress={() => setOpen(false)} />}
      >
        <ArchetypeChoices
          value={value}
          onChange={(next) => {
            hapticSelection();
            onChange(next);
            setOpen(false);
          }}
        />
      </BottomSheet>
    </>
  );
}
