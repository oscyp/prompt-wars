import { corsHeaders, getAuthUserId } from '../_shared/utils.ts';
import { RegistrationError } from '../_shared/registration-policy.ts';
import {
  readRegistrationBody,
  registrationFailure,
  registrationResponse,
  registrationRpc,
  registrationTokenHash,
} from '../_shared/registration-service.ts';

export interface EligibilityDependencies {
  userId(req: Request): Promise<string>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
}
export async function handleEligibility(
  req: Request,
  deps: EligibilityDependencies = {
    userId: (r) => getAuthUserId(r, { capability: 'account' }),
    rpc: registrationRpc,
  },
) {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });
  try {
    let userId: string;
    try {
      userId = await deps.userId(req);
    } catch {
      throw new RegistrationError('unauthorized', 401);
    }
    const body = await readRegistrationBody(req);
    if (body.action === 'status')
      return registrationResponse(
        await deps.rpc('get_account_eligibility', { p_profile_id: userId }),
      );
    if (body.action === 'complete')
      return registrationResponse(
        await deps.rpc('complete_existing_account_registration', {
          p_profile_id: userId,
          p_token_hash: await registrationTokenHash(body.registration_token),
        }),
      );
    throw new RegistrationError('invalid_action');
  } catch (error) {
    return registrationFailure(error);
  }
}
if (import.meta.main) Deno.serve((req) => handleEligibility(req));
