/**
 * Leaving a battle, from the confirm dialog through to the charge.
 *
 * One hook for every exit surface because the decision is the same everywhere
 * — has this player locked a prompt, what does that cost, and what do they
 * lose — while the placement differs per screen. Putting the branch here means
 * six screens cannot drift into six different answers about what leaving does.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { leaveBattle, leaveDialogCopy, type BattleMode } from '@/utils/battles';
import type { PromptUpdate } from '@/hooks/useRealtimeBattle';
import type { BattleFormat } from '@/types/battle';
import { insufficientCreditsMessage } from '@/utils/credits';
import { hapticSelection } from '@/utils/haptics';

/**
 * Shown while the real price is in flight, and if the price read fails.
 *
 * Display only — the server re-reads `character_edit_prices` and is
 * authoritative, so a stale number here surfaces as a 402 the player can act
 * on, never as a wrong charge.
 */
export const LEAVE_BATTLE_FALLBACK_CREDITS = 2;

export interface UseLeaveBattleArgs {
  format: BattleFormat;
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
  const [price, setPrice] = useState(LEAVE_BATTLE_FALLBACK_CREDITS);
  const [isLeaving, setIsLeaving] = useState(false);
  // Survives the re-render that setIsLeaving triggers, so a second tap landing
  // in the same frame cannot start a second request. The server is idempotent
  // either way; this stops the dialog stacking.
  const leavingRef = useRef(false);

  // Whether THIS player has committed. Derived from what useRealtimeBattle
  // already streams -- no extra query, no extra subscription -- so the dialog
  // flips from free to paid the instant the lock lands.
  const iHaveLocked =
    args.hasLockedPrompt ??
    Boolean(
      args.myProfileId &&
      args.prompts?.some(
        (p) => p.profile_id === args.myProfileId && p.is_locked,
      ),
    );

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('character_edit_prices')
      .select('credits')
      .eq('edit_kind', 'leave_battle')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || typeof data?.credits !== 'number') return;
        setPrice(data.credits);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          router.replace('/(tabs)/home');
        }
        return;
      }

      leavingRef.current = false;
      setIsLeaving(false);

      if (result.code === 'insufficient_credits') {
        Alert.alert(
          'Not enough credits',
          insufficientCreditsMessage(result.shortfall),
          [
            { text: 'Not now', style: 'cancel' },
            {
              // The point of this button: telling a player to top up from a
              // screen with no route to the wallet is the exact failure
              // CreditChip was written to fix.
              text: 'Top up',
              onPress: () => router.push('/(profile)/wallet'),
            },
          ],
        );
        return;
      }

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
      if (!battleId || leavingRef.current) return;
      hapticSelection();

      const copy = leaveDialogCopy({
        format: args.format,
        mode: args.mode,
        isBot: args.isBot,
        isLocked: iHaveLocked,
        price,
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
      price,
      performLeave,
    ],
  );

  return { price, iHaveLocked, isLeaving, confirmLeave };
}
