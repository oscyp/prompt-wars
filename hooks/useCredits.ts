import { useCallback, useEffect, useState } from 'react';
import { getWalletBalance } from '@/utils/monetization';

/**
 * Reads the player's spendable credit balance from the `entitlements` view
 * (via `getWalletBalance`). There is no realtime channel for the wallet, so the
 * balance is fetched on mount and re-fetched on demand — call `refresh()` after
 * any credit-spending mutation to keep a header chip in sync.
 */
export function useCredits() {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const balance = await getWalletBalance();
    setCredits(balance?.credits_balance ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const balance = await getWalletBalance();
      if (!active) return;
      setCredits(balance?.credits_balance ?? 0);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { credits, loading, refresh };
}
