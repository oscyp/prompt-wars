// Shared utilities for Edge Functions
import {
  createClient,
  SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * CORS headers for client requests
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function readKeyDictionaryValues(
  rawValue: string | undefined,
  preferredKeys: string[],
): string[] {
  const trimmedValue = rawValue?.trim();

  if (!trimmedValue) {
    return [];
  }

  if (!trimmedValue.startsWith('{')) {
    return [trimmedValue];
  }

  try {
    const parsed = JSON.parse(trimmedValue) as Record<string, unknown>;
    const values: string[] = [];

    for (const key of preferredKeys) {
      const value = parsed[key];
      if (typeof value === 'string' && value.trim()) {
        values.push(value.trim());
      }
    }

    for (const value of Object.values(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        values.push(value.trim());
      }
    }

    return [...new Set(values)];
  } catch (error) {
    console.error('Invalid Supabase key dictionary JSON:', error);
    return [];
  }
}

function readKeyDictionaryValue(
  rawValue: string | undefined,
  preferredKeys: string[],
): string {
  return readKeyDictionaryValues(rawValue, preferredKeys)[0] ?? '';
}

export function getSupabasePublishableKey(): string {
  return (
    readKeyDictionaryValue(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'), [
      'default',
      'publishable',
      'anon',
      'public',
    ]) ||
    (Deno.env.get('SUPABASE_ANON_KEY') ?? '')
  );
}

export function getSupabaseSecretKey(): string {
  return (
    readKeyDictionaryValue(Deno.env.get('SUPABASE_SECRET_KEYS'), [
      'default',
      'secret',
      'service_role',
      'service',
    ]) ||
    (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  );
}

export function getSupabaseSecretKeys(): string[] {
  const secretKeys = readKeyDictionaryValues(
    Deno.env.get('SUPABASE_SECRET_KEYS'),
    ['default', 'secret', 'service_role', 'service'],
  );
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  return legacyKey ? [...new Set([...secretKeys, legacyKey])] : secretKeys;
}

export function hasSupabaseSecretAuthorization(
  authHeader: string | null,
): boolean {
  const secretKeys = getSupabaseSecretKeys();
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

  return Boolean(bearerToken && secretKeys.includes(bearerToken));
}

function describeBearerToken(
  authHeader: string | null,
): Record<string, unknown> {
  const bearerToken = getBearerToken(authHeader);

  if (!authHeader) {
    return { present: false };
  }

  if (!bearerToken || bearerToken === authHeader) {
    return { present: true, bearer: false };
  }

  return {
    present: true,
    bearer: true,
    length: bearerToken.length,
    looksLikeJwt: bearerToken.split('.').length === 3,
    looksLikePublishableKey: bearerToken.startsWith('sb_publishable_'),
    looksLikeSecretKey: bearerToken.startsWith('sb_secret_'),
  };
}

function logAuthDiagnostics(
  authHeader: string | null,
  errorMessage?: string,
): void {
  const publishableKeys = readKeyDictionaryValues(
    Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
    ['default', 'publishable', 'anon', 'public'],
  );
  const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();

  console.error('Auth diagnostics', {
    error: errorMessage,
    hasSupabaseUrl: Boolean(Deno.env.get('SUPABASE_URL')),
    publishableKeyCount: publishableKeys.length,
    hasLegacyAnonKey: Boolean(legacyAnonKey),
    selectedPublishableKeyLength: getSupabasePublishableKey().length,
    authorization: describeBearerToken(authHeader),
  });
}

/**
 * Create Supabase client with service role (server-owned operations)
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = getSupabaseSecretKey();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create Supabase client with user JWT (validates user identity)
 */
export function createUserClient(authHeader: string | null): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabasePublishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: authHeader ?? '',
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getBearerToken(authHeader: string | null): string | null {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Get authenticated user ID from request
 */
export async function getAuthUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  const bearerToken = getBearerToken(authHeader);
  const client = createUserClient(authHeader);

  if (!bearerToken) {
    logAuthDiagnostics(authHeader, 'Missing bearer token');
    throw new Error('Unauthorized');
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser(bearerToken);

  if (error || !user) {
    logAuthDiagnostics(authHeader, error?.message);
    throw new Error('Unauthorized');
  }

  return user.id;
}

/**
 * Standard error response
 */
export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Standard success response
 */
export function successResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Generate idempotency key for transactions
 */
export function generateIdempotencyKey(parts: string[]): string {
  return parts.join('_');
}
