import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
  setRecoverySessionSafely,
  signOutSafely,
  type AuthOperation,
} from '@/utils/authSession';
import { deactivatePushToken } from '@/utils/notifications';
import { parseRecoveryLink } from '@/utils/authCopy';
import {
  getAccountEligibility,
  type AccountEligibility,
} from '@/utils/registration';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  restorationError: boolean;
  retrySessionRestore: () => Promise<void>;
  eligibility: AccountEligibility | null;
  eligibilityLoading: boolean;
  eligibilityError: boolean;
  refreshEligibility: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * A password-recovery session is active. The root gate sends the player to
   * the reset-password screen and nowhere else until `completeRecovery` runs.
   */
  recoveryPending: boolean;
  /** A recovery link is being exchanged for a session right now. */
  recoveryProcessing: boolean;
  /** After the new password is saved: ends the recovery session (signs out). */
  completeRecovery: (operation: AuthOperation) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Where the root gate has got to. Lives here rather than in `app/_layout.tsx`
 * so `app/index.tsx` can read it without a named export from a route file.
 */
export interface RouteGateState {
  /** Auth has loaded and the character check has answered. */
  resolved: boolean;
  /** Null until resolved, or while signed out. */
  hasCharacter: boolean | null;
}

export const RouteGateContext = createContext<RouteGateState>({
  resolved: false,
  hasCharacter: null,
});

export function useRouteGate(): RouteGateState {
  return useContext(RouteGateContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [restorationError, setRestorationError] = useState(false);
  const restoreRequest = useRef(0);
  const restoring = useRef(false);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryProcessing, setRecoveryProcessing] = useState(false);
  const socialAuthEnabled = process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED === '1';
  const currentAccountId = useRef<string | null>(null);
  const eligibilityRequest = useRef(0);
  const invalidateEligibility = useCallback(() => {
    eligibilityRequest.current++;
  }, []);
  const mounted = useRef(true);
  const [accessCheck, setAccessCheck] = useState<{
    accountId: string | null;
    data: AccountEligibility | null;
    loading: boolean;
    error: boolean;
  }>({ accountId: null, data: null, loading: false, error: false });

  const refreshEligibility = useCallback(async () => {
    const accountId = currentAccountId.current;
    if (!socialAuthEnabled || !accountId) return;
    const request = ++eligibilityRequest.current;
    setAccessCheck({ accountId, data: null, loading: true, error: false });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const data = await Promise.race([
        getAccountEligibility(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('eligibility_timeout')),
            15_000,
          );
        }),
      ]);
      if (
        !mounted.current ||
        currentAccountId.current !== accountId ||
        eligibilityRequest.current !== request
      )
        return;
      setAccessCheck({ accountId, data, loading: false, error: false });
    } catch {
      if (
        !mounted.current ||
        currentAccountId.current !== accountId ||
        eligibilityRequest.current !== request
      )
        return;
      // Never retain a prior allow decision after an unsuccessful refresh.
      setAccessCheck({ accountId, data: null, loading: false, error: true });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }, [socialAuthEnabled]);

  const ownsAccessCheck = accessCheck.accountId === user?.id;
  const eligibility =
    socialAuthEnabled && ownsAccessCheck ? accessCheck.data : null;
  const eligibilityLoading =
    socialAuthEnabled && !!user && (!ownsAccessCheck || accessCheck.loading);
  const eligibilityError =
    socialAuthEnabled && !!user && ownsAccessCheck && accessCheck.error;

  useEffect(() => {
    if (user?.id && !loading && !recoveryPending && !recoveryProcessing)
      void refreshEligibility();
  }, [
    user?.id,
    loading,
    recoveryPending,
    recoveryProcessing,
    refreshEligibility,
  ]);

  useEffect(() => {
    if (!socialAuthEnabled || recoveryPending || recoveryProcessing) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshEligibility();
    });
    return () => subscription.remove();
  }, [
    socialAuthEnabled,
    recoveryPending,
    recoveryProcessing,
    refreshEligibility,
  ]);

  const receiveSession = useCallback(
    (next: Session | null) => {
      if (!mounted.current) return;
      const accountId = next?.user.id ?? null;
      if (currentAccountId.current !== accountId) {
        currentAccountId.current = accountId;
        invalidateEligibility();
        setAccessCheck({
          accountId: null,
          data: null,
          loading: false,
          error: false,
        });
      }
      setSession(next);
      setUser(next?.user ?? null);
    },
    [invalidateEligibility],
  );

  const retrySessionRestore = useCallback(async () => {
    const request = ++restoreRequest.current;
    restoring.current = true;
    setLoading(true);
    setRestorationError(false);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // getSession restores and refreshes the SDK's persisted session. A failed
      // restore is not evidence that there is no account on this device.
      const { data, error } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('session_restore_timeout')),
            15_000,
          );
        }),
      ]);
      if (!mounted.current || request !== restoreRequest.current) return;
      if (error) throw error;
      if (
        data.session?.expires_at &&
        data.session.expires_at * 1000 <= Date.now()
      )
        throw new Error('session_refresh_required');
      receiveSession(data.session);
    } catch {
      if (mounted.current && request === restoreRequest.current)
        setRestorationError(true);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (mounted.current && request === restoreRequest.current) {
        restoring.current = false;
        setLoading(false);
      }
    }
  }, [receiveSession]);

  useEffect(() => {
    mounted.current = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted.current) return;
      // INITIAL_SESSION cannot distinguish an empty device from failed storage
      // or token refresh. Only the explicit restoration read can do that.
      if (event === 'INITIAL_SESSION') return;
      if (restoring.current && event === 'SIGNED_OUT') return;
      restoreRequest.current++;
      restoring.current = false;
      receiveSession(next);
      setRestorationError(false);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true);
      if (event === 'SIGNED_OUT') setRecoveryPending(false);
    });
    void retrySessionRestore();
    return () => {
      mounted.current = false;
      invalidateEligibility();
      subscription.unsubscribe();
    };
  }, [invalidateEligibility, receiveSession, retrySessionRestore]);

  // Password-recovery deep links. The client runs with detectSessionInUrl off,
  // so the tokens in the link have to be handed to it by hand; the gate then
  // routes to the reset screen on `recoveryPending`.
  useEffect(() => {
    let active = true;
    let recoveryRequest = 0;

    const handleUrl = async (url: string | null) => {
      const link = parseRecoveryLink(url);
      if (!link) return;
      const request = ++recoveryRequest;
      if (active) setRecoveryProcessing(true);
      try {
        const { error } =
          link.kind === 'tokens'
            ? await setRecoverySessionSafely({
                access_token: link.accessToken,
                refresh_token: link.refreshToken,
              })
            : await setRecoverySessionSafely({ code: link.code });
        if (error) throw error;
        if (active && request === recoveryRequest) setRecoveryPending(true);
      } catch {
        // The reset screen shows its expired-link state when no session lands.
        console.warn('Password recovery link could not be opened.');
      } finally {
        if (active && request === recoveryRequest) setRecoveryProcessing(false);
      }
    };

    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const signOut = useCallback(async () => {
    const operation = beginAuthOperation();
    await deactivatePushToken();
    const { error } = await signOutSafely(operation);
    if (error) throw error;
    assertAuthOperationCurrent(operation);
    setRecoveryPending(false);
  }, []);

  // The recovery session exists to set one password. Ending it means the new
  // password is proven at the very next sign-in rather than assumed.
  const completeRecovery = useCallback(async (operation: AuthOperation) => {
    assertAuthOperationCurrent(operation);
    const { error } = await signOutSafely(operation);
    if (error) throw error;
    assertAuthOperationCurrent(operation);
    setRecoveryPending(false);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      loading,
      restorationError,
      retrySessionRestore,
      eligibility,
      eligibilityLoading,
      eligibilityError,
      refreshEligibility,
      signOut,
      recoveryPending,
      recoveryProcessing,
      completeRecovery,
    }),
    [
      session,
      user,
      loading,
      restorationError,
      retrySessionRestore,
      eligibility,
      eligibilityLoading,
      eligibilityError,
      refreshEligibility,
      signOut,
      recoveryPending,
      recoveryProcessing,
      completeRecovery,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
