import {
  createClient,
  type AuthResponse,
  type AuthTokenResponse,
  type Session,
  type SignInAnonymouslyCredentials,
  type SignInWithIdTokenCredentials,
  type SignInWithPasswordCredentials,
  type SignUpWithPasswordCredentials,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { supabase } from './supabase';

/** A non-secret, in-memory marker for the user's latest authentication intent. */
export type AuthOperation = { readonly revision: number };
let revision = 0;
let mutations: Promise<void> = Promise.resolve();

export class AuthSessionChangedError extends Error {
  readonly code = 'session_changed';
  constructor() {
    super('Your sign-in request changed. Please try again.');
    this.name = 'AuthSessionChangedError';
  }
}

/** Call before any asynchronous provider/registration work for this gesture. */
export function beginAuthOperation(): AuthOperation {
  return { revision: ++revision };
}

export function assertAuthOperationCurrent(operation: AuthOperation): void {
  if (operation.revision !== revision) throw new AuthSessionChangedError();
}

function serializeMutation<T>(
  operation: AuthOperation,
  work: () => Promise<T>,
): Promise<T> {
  const result = mutations.then(async () => {
    assertAuthOperationCurrent(operation);
    const value = await work();
    assertAuthOperationCurrent(operation);
    return value;
  });
  // A rejected/cancelled operation must not block a later recovery or sign-out.
  mutations = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function exchange<T extends AuthResponse | AuthTokenResponse>(
  operation: AuthOperation,
  work: (auth: SupabaseClient['auth']) => Promise<T>,
): Promise<T> {
  assertAuthOperationCurrent(operation);
  // auth-js saves signup/sign-in sessions before its promise resolves. Keep
  // those network responses isolated until the operation is allowed to commit.
  const client = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `prompt-wars-auth-exchange-${operation.revision}`,
      },
    },
  );
  try {
    const result = await work(client.auth);
    assertAuthOperationCurrent(operation);
    if (result.error || !result.data.session) return result;
    const session = result.data.session;
    await serializeMutation(operation, async () => {
      const committed = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (committed.error) throw committed.error;
      if (committed.data.user?.id !== session.user.id)
        throw new AuthSessionChangedError();
    });
    return result;
  } finally {
    await client.auth.stopAutoRefresh();
  }
}

export function signInWithPasswordSafely(
  input: SignInWithPasswordCredentials,
  operation = beginAuthOperation(),
): Promise<AuthTokenResponse> {
  return exchange(operation, (auth) => auth.signInWithPassword(input));
}

export function signInAnonymouslySafely(
  input: SignInAnonymouslyCredentials,
  operation = beginAuthOperation(),
): Promise<AuthResponse> {
  return exchange(operation, (auth) => auth.signInAnonymously(input));
}

export function signInWithIdTokenSafely(
  input: SignInWithIdTokenCredentials,
  operation = beginAuthOperation(),
): Promise<AuthTokenResponse> {
  return exchange(operation, (auth) => auth.signInWithIdToken(input));
}

export function signUpWithPasswordSafely(
  input: SignUpWithPasswordCredentials,
  operation = beginAuthOperation(),
): Promise<AuthResponse> {
  return exchange(operation, (auth) => auth.signUp(input));
}

export function setRecoverySessionSafely(
  input: { access_token: string; refresh_token: string } | { code: string },
  operation = beginAuthOperation(),
) {
  return serializeMutation(operation, () =>
    'code' in input
      ? supabase.auth.exchangeCodeForSession(input.code)
      : supabase.auth.setSession(input),
  );
}

export function signOutSafely(operation = beginAuthOperation()) {
  return serializeMutation(operation, () => supabase.auth.signOut());
}

/** Publish an isolated identity update only to the account that started it. */
export function commitLinkedSessionSafely(
  session: Session,
  expectedUserId: string,
  operation: AuthOperation,
  options: { requirePermanent?: boolean } = {},
): Promise<Session> {
  return serializeMutation(operation, async () => {
    if (
      session.user.id !== expectedUserId ||
      (options.requirePermanent !== false &&
        session.user.is_anonymous !== false)
    )
      throw new AuthSessionChangedError();
    const current = await supabase.auth.getSession();
    if (current.error || current.data.session?.user.id !== expectedUserId)
      throw new AuthSessionChangedError();
    assertAuthOperationCurrent(operation);
    const committed = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (committed.error) throw committed.error;
    if (
      committed.data.session?.user.id !== expectedUserId ||
      (options.requirePermanent !== false &&
        committed.data.session.user.is_anonymous !== false)
    )
      throw new AuthSessionChangedError();
    return committed.data.session;
  });
}

export function updatePasswordSafely(
  password: string,
  expectedUserId: string,
  operation = beginAuthOperation(),
) {
  return serializeMutation(operation, async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !expectedUserId || data.session?.user.id !== expectedUserId)
      throw new AuthSessionChangedError();
    assertAuthOperationCurrent(operation);
    return supabase.auth.updateUser({ password });
  });
}
