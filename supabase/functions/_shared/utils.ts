// Shared utilities for Edge Functions
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * CORS headers for client requests
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Create Supabase client with service role (server-owned operations)
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey, {
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

/**
 * Get authenticated user ID from request
 */
export async function getAuthUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  const client = createUserClient(authHeader);
  
  const { data: { user }, error } = await client.auth.getUser();
  
  if (error || !user) {
    throw new Error('Unauthorized');
  }
  
  return user.id;
}

/**
 * Standard error response
 */
export function errorResponse(message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Standard success response
 */
export function successResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Generate idempotency key for transactions
 */
export function generateIdempotencyKey(parts: string[]): string {
  return parts.join('_');
}
