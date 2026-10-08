import {
  applyVerifiedConsentEvent,
  verifyConsentManagementCallback,
  type VerifiedConsentEvent,
} from '../_shared/consent-events.ts';
import {
  registrationFailure,
  registrationResponse,
} from '../_shared/registration-service.ts';
import { RegistrationError } from '../_shared/registration-policy.ts';

export async function handleConsentCallback(
  req: Request,
  verify = verifyConsentManagementCallback,
  apply: (
    event: VerifiedConsentEvent,
  ) => Promise<unknown> = applyVerifiedConsentEvent,
) {
  try {
    if (req.method !== 'POST')
      throw new RegistrationError('method_not_allowed', 405);
    // No session token, redirect query or unverified JSON is an approval.
    // The CM adapter must authenticate the unmodified provider request first.
    const event = await verify(req);
    const applied = await apply(event);
    return registrationResponse({ received: true, applied: applied === true });
  } catch (error) {
    return registrationFailure(error);
  }
}
if (import.meta.main) Deno.serve((req) => handleConsentCallback(req));
