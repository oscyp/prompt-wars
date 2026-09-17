/** Explicit free forfeit/cancel only; navigation parks without calling this API. */
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  leaveBattle,
  leaveDialogCopy,
  canLeaveBattleStatus,
  type BattleMode,
} from '@/utils/battles';
import type { PromptUpdate } from '@/hooks/useRealtimeBattle';
import type { BattleFormat } from '@/types/battle';
import { hapticSelection } from '@/utils/haptics';

export const LEAVE_BATTLE_FALLBACK_CREDITS = 0;

export interface UseLeaveBattleArgs {
  format: BattleFormat;
  status?: string;
  hasOpponent?: boolean;
  mode: BattleMode;
  isBot: boolean;
  prompts?: PromptUpdate[];
  myProfileId: string | null | undefined;
  /** List rows know lock state from battle/round timestamps without prompts. */
  hasLockedPrompt?: boolean;
}

export function useLeaveBattle(
  battleId: string | null,
  args: UseLeaveBattleArgs,
) {
  const router = useRouter();
  const price = 0;
  const canForfeit =
    args.status === undefined || canLeaveBattleStatus(args.status);
  const [isLeaving, setIsLeaving] = useState(false);
  // Survives the re-render that setIsLeaving triggers, so a second tap landing
  // in the same frame cannot start a second request. The server is idempotent
  // either way; this stops the dialog stacking.
  const leavingRef = useRef(false);

  const iHaveLocked =
    args.hasLockedPrompt ??
    Boolean(
      args.myProfileId &&
      args.prompts?.some(
        (p) => p.profile_id === args.myProfileId && p.is_locked,
      ),
    );

  const performLeave = useCallback(
    async (onLeft?: () => void) => {
      if (!battleId || leavingRef.current) return;
      leavingRef.current = true;
      setIsLeaving(true);

      const result = await leaveBattle(battleId);

      if (result.success) {
        // Deliberately stays true through the navigation: the guard on these
        // screens keys off it, and a router.replace is itself a removal, so
        // clearing it here would re-trip the confirm dialog on the way out.
        if (onLeft) {
          onLeft();
        } else {
          router.dismissTo('/(tabs)/home');
        }
        return;
      }

      leavingRef.current = false;
      setIsLeaving(false);

      Alert.alert('Could not leave', result.error ?? 'Please try again.');
    },
    [battleId, router],
  );

  /**
   * Asks first, then leaves.
   *
   * `onLeft` is how the navigation guard hands back its own pending action:
   * the player was already going somewhere, so completing that beats
   * redirecting them home.
   */
  const confirmLeave = useCallback(
    (onLeft?: () => void) => {
      if (!battleId || leavingRef.current || !canForfeit) return;
      hapticSelection();

      const copy = leaveDialogCopy({
        format: args.format,
        mode: args.mode,
        isBot: args.isBot,
        isLocked: iHaveLocked,
        price,
        hasOpponent: args.hasOpponent,
      });

      Alert.alert(copy.title, copy.message, [
        { text: 'Stay', style: 'cancel' },
        {
          text: copy.confirmLabel,
          style: 'destructive',
          onPress: () => void performLeave(onLeft),
        },
      ]);
    },
    [
      battleId,
      args.format,
      args.mode,
      args.isBot,
      iHaveLocked,
      canForfeit,
      args.hasOpponent,
      price,
      performLeave,
    ],
  );

  return { price, iHaveLocked, isLeaving, confirmLeave, canForfeit };
}
