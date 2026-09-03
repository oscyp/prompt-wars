import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import * as Linking from 'expo-linking';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import { deactivatePushToken } from '@/utils/notifications';
import { parseRecoveryLink } from '@/utils/authCopy';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /**
   * A password-recovery session is active. The root gate sends the player to
   * the reset-password screen and nowhere else until `completeRecovery` runs.
   */
  recoveryPending: boolean;
  /** A recovery link is being exchanged for a session right now. */
  recoveryProcessing: boolean;
  /** After the new password is saved: ends the recovery session (signs out). */
  completeRecovery: () => Promise<void>;
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
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [recoveryProcessing, setRecoveryProcessing] = useState(false);

  useEffect(() => {
    // Get initial session. `finally` rather than `then` for the loading flag:
    // a rejected read (corrupt storage, a throwing polyfill) used to leave the
    // app on the splash screen forever.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch((err) => {
        console.warn('Could not restore auth session:', err);
      })
      .finally(() => setLoading(false));

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecoveryPending(true);
      if (event === 'SIGNED_OUT') setRecoveryPending(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Password-recovery deep links. The client runs with detectSessionInUrl off,
  // so the tokens in the link have to be handed to it by hand; the gate then
  // routes to the reset screen on `recoveryPending`.
  useEffect(() => {
    let active = true;

    const handleUrl = async (url: string | null) => {
      const link = parseRecoveryLink(url);
      if (!link) return;
      if (active) setRecoveryProcessing(true);
      try {
        const { error } =
          link.kind === 'tokens'
            ? await supabase.auth.setSession({
                access_token: link.accessToken,
                refresh_token: link.refreshToken,
              })
            : await supabase.auth.exchangeCodeForSession(link.code);
        if (error) throw error;
        if (active) setRecoveryPending(true);
      } catch (err) {
        // The reset screen shows its expired-link state when no session lands.
        console.warn('Password recovery link could not be opened:', err);
      } finally {
        if (active) setRecoveryProcessing(false);
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
    await deactivatePushToken();
    setRecoveryPending(false);
    await supabase.auth.signOut();
  }, []);

  // The recovery session exists to set one password. Ending it means the new
  // password is proven at the very next sign-in rather than assumed.
  const completeRecovery = useCallback(async () => {
    setRecoveryPending(false);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user,
      loading,
      signOut,
      recoveryPending,
      recoveryProcessing,
      completeRecovery,
    }),
    [
      session,
      user,
      loading,
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
