import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing Supabase environment variables. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  );
}

const supabaseFunctionKey = supabasePublishableKey;

function describeAccessToken(token: string): Record<string, unknown> {
  const parts = token.split('.');
  return {
    present: Boolean(token),
    length: token.length,
    looksLikeJwt: parts.length === 3,
    prefix: token.slice(0, 16),
  };
}

// Create a factory function for initializing Supabase
const createSupabaseClient = (): SupabaseClient => {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  // Configure app state monitoring for auth refresh
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  });

  return client;
};

// Create and export the client
export const supabase = createSupabaseClient();

/**
 * A non-2xx from an Edge Function, carrying the parsed body.
 *
 * `invokeAuthenticatedFunction` used to throw a bare `Error` with only the
 * message, so a caller could not tell a 402 from a 500 without matching on
 * prose. leave-battle needs the machine-readable `code` and the credit
 * `shortfall` to decide between "you are short 1 credit, here is the shop" and
 * a generic failure. Extending Error rather than changing the throw shape
 * keeps every existing `catch (err) { err.message }` working untouched.
 */
export class FunctionInvokeError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | null;

  constructor(
    message: string,
    status: number,
    body: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = 'FunctionInvokeError';
    this.status = status;
    this.body = body;
  }
}

function getFunctionErrorMessage(
  functionName: string,
  data: unknown,
  fallback?: string,
): string {
  if (data && typeof data === 'object') {
    const payload = data as {
      error?: string | { message?: string };
      message?: string;
    };

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }

    if (
      payload.error &&
      typeof payload.error === 'object' &&
      typeof payload.error.message === 'string' &&
      payload.error.message.trim()
    ) {
      return payload.error.message;
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
  }

  return fallback || `Function ${functionName} failed`;
}

async function getFunctionAccessToken(): Promise<string> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message || 'Unable to read auth session');
  }

  if (!session?.access_token) {
    throw new Error('You must be signed in to continue.');
  }

  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;

  if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError) {
      throw new Error(refreshError.message || 'Unable to refresh auth session');
    }

    if (refreshedSession?.access_token) {
      return refreshedSession.access_token;
    }
  }

  return session.access_token;
}

async function fetchAuthenticatedFunction(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<Response> {
  return fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: supabaseFunctionKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function invokeAuthenticatedFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  let accessToken = await getFunctionAccessToken();
  const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
  let response = await fetchAuthenticatedFunction(
    functionName,
    body,
    accessToken,
  );

  if (response.status === 401) {
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (!refreshError && refreshedSession?.access_token) {
      accessToken = refreshedSession.access_token;
      response = await fetchAuthenticatedFunction(
        functionName,
        body,
        accessToken,
      );
    }
  }

  const responseText = await response.text();
  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    console.error('Supabase function invoke failed', {
      functionName,
      functionUrl,
      status: response.status,
      statusText: response.statusText,
      requestBody: body,
      responseText,
      responseData: data,
      supabaseUrl,
      accessToken: describeAccessToken(accessToken),
    });
    throw new FunctionInvokeError(
      getFunctionErrorMessage(functionName, data, responseText),
      response.status,
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)
        : null,
    );
  }

  return data as T;
}

/**
 * `{ data, error }` adapter over `invokeAuthenticatedFunction`.
 *
 * Seventeen call sites used `supabase.functions.invoke` directly and so got
 * none of the auth handling this module provides: no pre-emptive refresh when
 * the token is within 60s of expiry, and no retry on 401. After a token lapse
 * they simply failed -- silently, in the case of cosmetics purchase, video
 * upgrade, reporting and the daily-meta claims.
 *
 * `invokeAuthenticatedFunction` throws where `functions.invoke` returns an
 * error object, so converting each site by hand would have meant rewriting
 * every caller's error handling too. This keeps the existing contract exactly
 * and changes one line per site.
 *
 * Prefer `invokeAuthenticatedFunction` directly in new code -- throwing is the
 * better interface. This exists so an established pattern could be migrated
 * without churning thirteen error paths.
 */
export async function invokeFunctionResult<T>(
  functionName: string,
  body: Record<string, unknown> = {},
): Promise<{ data: T | null; error: { message: string } | null }> {
  try {
    return { data: await invokeAuthenticatedFunction<T>(functionName, body), error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Request failed' },
    };
  }
}
