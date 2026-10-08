import React from 'react';
import { View } from 'react-native';
import BottomSheet from '@/components/sheets/BottomSheet';
import { GameButton, GameText } from '@/components/game';
import type { MoveType } from '@/utils/battles';

/** Full exact prompt scrolls independently of reachable cancel/commit actions. */
export function PromptLockConfirmation({
  visible,
  text,
  moveType,
  disabled,
  onClose,
  onConfirm,
  returnFocusRef,
}: {
  visible: boolean;
  text: string;
  moveType: MoveType | null;
  disabled: boolean;
  onClose: () => void;
  onConfirm: () => void;
  returnFocusRef?: React.RefObject<View | null>;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Lock in this move?"
      fixedHeading
      closeAccessibilityLabel="Return to your prompt"
      returnFocusRef={returnFocusRef}
      footer={
        <View style={{ gap: 8 }}>
          <GameButton label="Lock in" onPress={onConfirm} disabled={disabled} />
          <GameButton
            label="Keep editing"
            onPress={onClose}
            tone="secondary"
            chrome="text"
          />
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <GameText variant="label">
          {moveType === 'attack'
            ? 'Attack'
            : moveType === 'defense'
              ? 'Defense'
              : moveType === 'finisher'
                ? 'Finisher'
                : 'Choose a type'}
        </GameText>
        <GameText selectable>{text}</GameText>
        <GameText>You can’t change this prompt after locking in.</GameText>
      </View>
    </BottomSheet>
  );
}
