/**
 * Makes every way off a battle screen go through the leave dialog.
 *
 * The header chevron, the swipe-back gesture and Android's hardware back all
 * funnel into the navigator's remove action, so one `usePreventRemove` covers
 * all three — which is why no `BackHandler` is needed here and none should be
 * added. Before this, backing out of move-select dropped the player into the
 * tab shell with the battle still open and the opponent still waiting.
 *
 * Composed with useLeaveBattle rather than folded into it: the hook is also
 * used on screens that offer leaving as an explicit button without guarding
 * navigation (waiting.tsx, where returning home is a sanctioned park, not an
 * exit).
 *
 * Forward navigation is a removal too. `router.replace` from the face-off to
 * move-select, or from round-result to the next round, removes the current
 * screen, and a guard that is still armed intercepts it -- so tapping Continue
 * opened the "Leave battle?" dialog, and confirming it cancelled the battle the
 * player was trying to play. Every programmatic exit therefore goes through
 * `exitTo`, which disarms the guard and navigates once the navigator's listener
 * has seen it disarmed.
 *
 * The guard then STAYS down until this screen is focused again. expo-router's
 * `router.replace` does not dispatch synchronously -- it queues a ROUTER_LINK
 * action that the root flushes later -- so re-arming right after calling it
 * put the guard back up before the replace ran, and the dialog came back. A
 * screen that is being replaced never regains focus; one that was pushed over
 * does, and re-arms then.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import {
  useLeaveBattle,
  type UseLeaveBattleArgs,
} from '@/hooks/useLeaveBattle';

interface PendingExit {
  run: () => void;
}

export function useBattleExitGuard(
  battleId: string | null,
  args: UseLeaveBattleArgs & {
    /**
     * Off on terminal screens, and while the battle is still loading — a guard
     * that fires before we know the format would quote the wrong dialog.
     */
    enabled?: boolean;
  },
) {
  const navigation = useNavigation();
  const leave = useLeaveBattle(battleId, args);
  const enabled = args.enabled ?? true;
  // Staged rather than run immediately: `usePreventRemove` reads its boolean
  // from the latest render, so the navigation must happen one render AFTER
  // the guard has seen itself disarmed, or the removal is still intercepted.
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);

  usePreventRemove(
    // `isLeaving` must switch the guard OFF, not just gate the dialog: the
    // success path navigates with router.replace, which is itself a removal,
    // and a guard still armed at that moment re-opens the confirm dialog on
    // the way out — forever.
    Boolean(battleId) && enabled && !leave.isLeaving && pendingExit === null,
    ({ data }) => {
      // Hand the pending navigation back to the hook. The player was already
      // going somewhere; completing that beats overriding it with a redirect
      // home, and it is what makes the back gesture feel like back.
      leave.confirmLeave(() => navigation.dispatch(data.action));
    },
  );

  useEffect(() => {
    if (!pendingExit) return;
    pendingExit.run();
    // Deliberately NOT re-armed here: see the header comment. The navigation
    // may still be queued, and an armed guard would intercept it.
  }, [pendingExit]);

  // Re-arm only when the player is back on this screen, which after a replace
  // never happens and after a push happens on the way back.
  useEffect(() => {
    if (!pendingExit) return;
    return navigation.addListener('focus', () => setPendingExit(null));
  }, [navigation, pendingExit]);

  /**
   * Leave this screen on purpose, without the dialog: `navigate` runs after
   * the guard has stood down. Use it for every `router.replace` off a guarded
   * screen -- advancing to the next step, and redirects when the battle ends.
   */
  const exitTo = useCallback((navigate: () => void) => {
    setPendingExit({ run: navigate });
  }, []);

  return { ...leave, exitTo };
}
