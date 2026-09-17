import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getWalletBalance } from '@/utils/monetization';

/**
 * Reads the player's spendable credit balance from the `entitlements` view
 * (via `getWalletBalance`). There is no realtime channel for the wallet, so the
 * balance is fetched on mount and re-fetched on demand — call `refresh()` after
 * any credit-spending mutation to keep a header chip in sync.
 *
 * `error` is true when the last read came back empty: `getWalletBalance`
 * swallows failures into `null`, and a chip that then says "0 credits" is
 * claiming something it does not know. Callers should show the chip as
 * unavailable instead of as zero.
 */
export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const active = useRef(true);
  const navigation = useContext(NavigationContext);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    const balance = await getWalletBalance();
    if (!active.current || id !== request.current) return;
    if (balance) setCredits(balance.credits_balance);
    setError(balance === null);
    setLoading(false);
  }, []);

  useEffect(() => {
    active.current = true;
    void refresh();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      foreground.remove();
      active.current = false;
    };
  }, [refresh]);

  useEffect(
    () =>
      navigation?.addListener('focus', () => {
        void refresh();
      }),
    [navigation, refresh],
  );

  return { credits, loading, error, refresh };
}
