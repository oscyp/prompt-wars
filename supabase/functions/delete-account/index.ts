// Delete Account Edge Function
// In-app account deletion, required by App Store guideline 5.1.1(v).
//
// Two steps, in this order:
//   1. delete_my_account() scrubs all personal data but keeps the profile row.
//      A hard DELETE would cascade to battles (destroying the opponent's match
//      history) and to purchases / wallet_transactions.
//   2. auth.admin.deleteUser() removes the credential, which is what actually
//      makes the account unrecoverable. There is no FK from profiles to
//      auth.users, so this does not cascade.
//
// If step 2 fails the profile is already anonymized and the call returns an
// error, so a retry is safe: step 1 is idempotent via profiles.deleted_at.

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
  getAuthUserId,
} from '../_shared/utils.ts';

interface DeleteAccountRequest {
  // Typed confirmation from the UI so an accidental invocation cannot delete
  // an account. The client sends the literal string "DELETE".
  confirm?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const userId = await getAuthUserId(req);

    let body: DeleteAccountRequest = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine; the confirm check below still applies.
    }

    if (body.confirm !== 'DELETE') {
      return errorResponse('Confirmation required', 400);
    }

    const supabase = createServiceClient();

    const { data: scrubbed, error: scrubError } = await supabase.rpc(
      'delete_my_account',
      { p_profile_id: userId },
    );

    if (scrubError) {
      console.error('Account scrub failed:', scrubError);
      return errorResponse('Failed to delete account', 500);
    }

    // Revoke access last. Anonymized-but-signed-in is a recoverable state;
    // deleted-auth-but-unscrubbed would leave personal data behind with no
    // way for the user to retry.
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Auth user deletion failed:', authError);
      return errorResponse(
        'Your data was removed but sign-out failed. Please contact support.',
        500,
      );
    }

    return successResponse({
      deleted: true,
      already_deleted: (scrubbed as { already_deleted?: boolean } | null)
        ?.already_deleted ?? false,
      message: 'Your account and personal data have been deleted.',
    });
  } catch (error) {
    console.error('Delete account error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    // getAuthUserId throws on a missing/invalid token; surface that as 401
    // rather than the blanket 500 other functions return.
    const status = message.toLowerCase().includes('unauthorized') ? 401 : 500;
    return errorResponse(message, status);
  }
});
