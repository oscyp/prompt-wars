import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BATTLE_MODES, BattleMode } from '@/constants/BattleModes';
import BottomSheet from './sheets/BottomSheet';
import ModeCard from './ModeCard';
import { GameText } from './game';

/**
 * Lets any screen inside the tab shell open the battle-mode sheet (the raised
 * center tab action). Provided by `(tabs)/_layout.tsx`; a no-op default keeps
 * consumers safe outside the shell.
 */
const BattleSheetContext = createContext<{ open: () => void }>({
  open: () => {},
});

export const BattleSheetProvider = BattleSheetContext.Provider;

export function useBattleSheet() {
  return useContext(BattleSheetContext);
}

export interface BattleModeSheetProps {
  visible: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<View | null>;
}

/**
 * Bottom sheet for picking a battle mode (Ranked / Casual / vs Bot) — the
 * target of the raised center "Battle" tab button. Selecting a mode routes to
 * matchmaking. Slide-up animation is skipped under Reduce Motion.
 */
export default function BattleModeSheet({
  visible,
  onClose,
  returnFocusRef,
}: BattleModeSheetProps) {
  const router = useRouter();
  const selectingRef = useRef(false);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    if (!visible) {
      selectingRef.current = false;
      setSelecting(false);
    }
  }, [visible]);

  const selectMode = (mode: BattleMode) => {
    // A ref closes the same-frame gap before React applies disabled. This tap
    // is the explicit matchmaking action; it must produce one route only.
    if (selectingRef.current) return;
    selectingRef.current = true;
    setSelecting(true);
    onClose();
    router.push(`/(battle)/matchmaking?mode=${mode}`);
  };

  return (
    <BottomSheet
      returnFocusRef={returnFocusRef}
      visible={visible}
      onClose={onClose}
      title="Start a Battle"
      subtitle="Choose your battle mode"
      closeAccessibilityLabel="Close battle modes"
    >
      <View style={{ gap: 16 }}>
        <GameText variant="caption" style={{ textAlign: 'center' }}>
          Your words. Your fighter.
        </GameText>
        {BATTLE_MODES.map((info) => (
          <ModeCard
            key={info.mode}
            info={info}
            onPress={selectMode}
            disabled={selecting}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
