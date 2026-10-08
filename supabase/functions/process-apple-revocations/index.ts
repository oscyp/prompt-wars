import {
  corsHeaders,
  errorResponse,
  hasSupabaseSecretAuthorization,
  successResponse,
} from '../_shared/utils.ts';
import {
  createAppleRevocationStore,
  processAppleRevocations,
  readAppleConfig,
} from '../_shared/apple-auth.ts';

export async function handleAppleRevocations(
  req: Request,
  run = () =>
    processAppleRevocations({
      config: readAppleConfig(),
      store: createAppleRevocationStore(),
    }),
): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  if (
    !hasSupabaseSecretAuthorization(
      req.headers.get('Authorization'),
      req.headers.get('apikey'),
    )
  ) {
    return errorResponse('Unauthorized', 401);
  }
  try {
    return successResponse(await run());
  } catch {
    // Jobs retain their ciphertext and become claimable when the lease expires.
    console.warn('Apple revocation worker could not finish');
    return errorResponse('Apple revocation worker unavailable', 503);
  }
}

if (import.meta.main) Deno.serve((req) => handleAppleRevocations(req));
