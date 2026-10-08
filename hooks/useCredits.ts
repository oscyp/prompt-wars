import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getWalletBalance } from '@/utils/monetization';

/** Undefined keeps compatibility for callers whose screen is already account-scoped.
 * Explicit null means signed out; account keys fence every asynchronous read. */
export function useCredits(accountId?: string | null) {
  const [state, setState] = useState({
    accountId,
    credits: 0,
    loading: true,
    error: false,
  });
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const active = useRef(true);
  const request = useRef(0);
  const navigation = useContext(NavigationContext);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    if (accountId === null) {
      setState({ accountId, credits: 0, loading: false, error: true });
      return;
    }
    let balance = null;
    try {
      balance = await getWalletBalance();
    } catch {
      /* A read failure never means zero. */
    }
    if (
      !active.current ||
      id !== request.current ||
      currentAccount.current !== accountId
    )
      return;
    setState((old) => ({
      accountId,
      credits:
        balance?.credits_balance ??
        (old.accountId === accountId ? old.credits : 0),
      error: balance === null,
      loading: false,
    }));
  }, [accountId]);

  useEffect(() => {
    active.current = true;
    void refresh();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      foreground.remove();
      active.current = false;
      request.current += 1;
    };
  }, [refresh]);
  useEffect(
    () =>
      navigation?.addListener('focus', () => {
        void refresh();
      }),
    [navigation, refresh],
  );
  const ownsState = state.accountId === accountId;
  return {
    credits: ownsState ? state.credits : 0,
    loading: accountId !== null && (!ownsState || state.loading),
    error: accountId === null || (ownsState && state.error),
    refresh,
  };
}
