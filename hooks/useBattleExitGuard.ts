/** Saves before leaving the workspace and parks in Arena; forfeiture is explicit. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigation, useRouter } from 'expo-router';
import { Alert } from 'react-native';
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
    beforeExit?: () => Promise<void>;
  },
) {
  const navigation = useNavigation();
  const router = useRouter();
  const leave = useLeaveBattle(battleId, args);
  const enabled = args.enabled ?? true;
  const beforeExit = args.beforeExit;
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
    () => {
      const run = () => router.dismissTo('/(tabs)/home');
      Promise.resolve(beforeExit?.())
        .then(() => setPendingExit({ run }))
        .catch(() => {
          Alert.alert(
            'Draft not saved',
            'Please retry saving your draft before returning to Arena.',
          );
        });
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

  const park = useCallback(() => {
    Promise.resolve(beforeExit?.())
      .then(() => {
        setPendingExit({ run: () => router.dismissTo('/(tabs)/home') });
      })
      .catch(() =>
        Alert.alert(
          'Draft not saved',
          'Please retry saving your draft before returning to Arena.',
        ),
      );
  }, [beforeExit, router]);
  return { ...leave, exitTo, park };
}
