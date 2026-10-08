import {
  corsHeaders,
  createServiceClient,
  errorResponse,
  getAuthUserId,
  successResponse,
} from '../_shared/utils.ts';
import {
  AppleAuthError,
  createAppleCredentialStore,
  readAppleConfig,
  retainAppleAuthorization,
} from '../_shared/apple-auth.ts';

export async function handleAppleAuthorization(
  req: Request,
): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  try {
    // Account lifecycle operations remain available before onboarding and after a block.
    const userId = await getAuthUserId(req, { capability: 'account' });
    let input: unknown;
    try {
      input = await req.json();
    } catch {
      return errorResponse('Invalid request', 400);
    }
    if (!input || typeof input !== 'object')
      return errorResponse('Invalid request', 400);
    const body = input as Record<string, unknown>;
    if (
      typeof body.authorization_code !== 'string' ||
      typeof body.nonce !== 'string'
    ) {
      return errorResponse('Authorization code and nonce required', 400);
    }
    const config = readAppleConfig();
    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user) return errorResponse('Unauthorized', 401);
    const result = await retainAppleAuthorization(
      {
        authorizationCode: body.authorization_code,
        nonce: body.nonce,
        user: data.user,
      },
      { config, store: createAppleCredentialStore(supabase) },
    );
    if (result === 'queued')
      return errorResponse('Account deletion is pending', 409, {
        code: 'account_deletion_pending',
      });
    return successResponse({ recorded: true });
  } catch (error) {
    if (error instanceof AppleAuthError) {
      console.warn('Apple authorization unavailable', { code: error.code });
      return errorResponse(
        'Apple authorization could not be saved. Please try again.',
        error.status,
        { code: error.code },
      );
    }
    const unauthorized =
      error instanceof Error && error.message === 'Unauthorized';
    console.warn('Apple authorization request failed', {
      code: unauthorized ? 'unauthorized' : 'internal_error',
    });
    return errorResponse(
      unauthorized ? 'Unauthorized' : 'Apple authorization could not be saved',
      unauthorized ? 401 : 500,
    );
  }
}

if (import.meta.main) Deno.serve(handleAppleAuthorization);
