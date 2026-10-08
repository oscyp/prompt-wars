// Preserve opponents' match history by scrubbing the profile, then remove Auth.
// Apple revocation is captured durably before Auth deletion and retried separately.
import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';
import {
  createAppleRevocationStore,
  processAppleRevocations,
  readAppleConfig,
} from '../_shared/apple-auth.ts';

export interface DeleteAccountDependencies {
  getUserId(req: Request): Promise<string>;
  prepareDeletion(
    userId: string,
  ): Promise<{ already_deleted?: boolean; profile_missing?: boolean }>;
  deleteAuthUser(userId: string): Promise<void>;
  revokeApple(userId: string): Promise<void>;
}

function dependencies(): DeleteAccountDependencies {
  return {
    getUserId: (req) => getAuthUserId(req, { capability: 'account' }),
    async prepareDeletion(userId) {
      const { data, error } = await createServiceClient().rpc(
        'prepare_account_deletion',
        { p_user_id: userId },
      );
      if (error) throw new Error('Account scrub failed');
      return data ?? {};
    },
    async deleteAuthUser(userId) {
      const { error } =
        await createServiceClient().auth.admin.deleteUser(userId);
      if (error) throw new Error('Auth deletion failed');
    },
    async revokeApple(userId) {
      await processAppleRevocations(
        { config: readAppleConfig(), store: createAppleRevocationStore() },
        userId,
      );
    },
  };
}

export async function handleDeleteAccount(
  req: Request,
  deps = dependencies(),
): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);
  let userId: string;
  try {
    userId = await deps.getUserId(req);
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.message === 'Unauthorized';
    return errorResponse(
      unauthorized ? 'Unauthorized' : 'Account deletion unavailable',
      unauthorized ? 401 : 500,
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Confirmation required', 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    (body as Record<string, unknown>).confirm !== 'DELETE'
  ) {
    return errorResponse('Confirmation required', 400);
  }
  let scrubbed: Awaited<
    ReturnType<DeleteAccountDependencies['prepareDeletion']>
  >;
  try {
    // One transaction captures Apple credentials, erases registration data, and scrubs
    // an existing profile. A missing profile is allowed: Auth must still be removed.
    scrubbed = await deps.prepareDeletion(userId);
  } catch {
    console.warn('Account deletion preparation failed');
    return errorResponse('Failed to delete account. Please try again.', 500);
  }
  try {
    await deps.deleteAuthUser(userId);
  } catch {
    console.warn('Auth identity deletion failed after profile scrub');
    return errorResponse(
      'Your profile was deactivated, but account deletion is incomplete. Please try again.',
      500,
    );
  }
  try {
    await deps.revokeApple(userId);
  } catch {
    // Missing Apple configuration or a provider outage must not block deletion.
    // The durable queue survives Auth deletion and is serviced by the worker.
    console.warn('Apple revocation deferred to worker');
  }
  return successResponse({
    deleted: true,
    already_deleted: scrubbed.already_deleted ?? false,
    message: 'Your account has been deleted. Retained match records are described in the Privacy Policy.',
  });
}

if (import.meta.main) Deno.serve((req) => handleDeleteAccount(req));
