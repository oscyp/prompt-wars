import React, { createContext, useContext, useEffect, useRef } from 'react';
import type { View } from 'react-native';
import { usePathname } from 'expo-router';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from './AuthProvider';

const TabBalanceContext = createContext<
  ReturnType<typeof useCredits> & {
    walletFocusRef: React.RefObject<View | null>;
  }
>({
  walletFocusRef: { current: null },
  credits: 0,
  loading: true,
  error: false,
  refresh: async () => {},
});

/** One reader for all tab headers; existing tab navigators stay mounted. */
export function TabBalanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const balance = useCredits(user?.id ?? null);
  const { refresh } = balance;
  const walletFocusRef = useRef<View>(null);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      void refresh();
    }
  }, [pathname, refresh]);
  return (
    <TabBalanceContext.Provider value={{ ...balance, walletFocusRef }}>
      {children}
    </TabBalanceContext.Provider>
  );
}

export function useTabBalance() {
  return useContext(TabBalanceContext);
}
