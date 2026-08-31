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
 */

import { useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import {
  useLeaveBattle,
  type UseLeaveBattleArgs,
} from '@/hooks/useLeaveBattle';

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

  usePreventRemove(
    // `isLeaving` must switch the guard OFF, not just gate the dialog: the
    // success path navigates with router.replace, which is itself a removal,
    // and a guard still armed at that moment re-opens the confirm dialog on
    // the way out — forever.
    Boolean(battleId) && enabled && !leave.isLeaving,
    ({ data }) => {
      // Hand the pending navigation back to the hook. The player was already
      // going somewhere; completing that beats overriding it with a redirect
      // home, and it is what makes the back gesture feel like back.
      leave.confirmLeave(() => navigation.dispatch(data.action));
    },
  );

  return leave;
}
