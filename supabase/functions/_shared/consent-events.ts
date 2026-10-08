import { RegistrationError } from './registration-policy.ts';
import { registrationRpc } from './registration-service.ts';

/** Normalized internal contract, not a guessed KWS Consent Management payload. */
export interface VerifiedConsentEvent {
  verifiedBy: 'kws_consent_management';
  eventId: string;
  registrationId: string;
  providerReference: string;
  policyVersion: string;
  occurredAt: string;
  decision: 'approved' | 'denied' | 'expired' | 'revoked';
  evidence?: {
    guardianVerified: true;
    consentGranted: true;
    reference: string;
  };
}
export async function applyVerifiedConsentEvent(
  event: VerifiedConsentEvent,
  rpc = registrationRpc,
) {
  const nonemptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;
  if (
    event.verifiedBy !== 'kws_consent_management' ||
    !nonemptyString(event.eventId) ||
    !nonemptyString(event.providerReference) ||
    !nonemptyString(event.policyVersion) ||
    !nonemptyString(event.registrationId) ||
    !['approved', 'denied', 'expired', 'revoked'].includes(event.decision) ||
    !Number.isFinite(Date.parse(event.occurredAt))
  ) {
    throw new RegistrationError('invalid_consent_event', 403);
  }
  if (
    event.decision === 'approved' &&
    (event.evidence?.guardianVerified !== true ||
      event.evidence.consentGranted !== true ||
      !nonemptyString(event.evidence.reference))
  ) {
    throw new RegistrationError('consent_evidence_required', 403);
  }
  return rpc('apply_guardian_consent', {
    p_registration_id: event.registrationId,
    p_event_id: event.eventId,
    p_decision: event.decision,
    p_occurred_at: event.occurredAt,
    p_reference: event.providerReference,
    p_evidence: {
      kind: 'guardian_consent',
      policy_version: event.policyVersion,
      source: event.verifiedBy,
      evidence_reference: event.evidence?.reference ?? null,
    },
  });
}

/** Fail closed until KWS supplies the reviewed, product-specific CM contract. */
export async function verifyConsentManagementCallback(
  _req: Request,
): Promise<VerifiedConsentEvent> {
  throw new RegistrationError('consent_unavailable', 503);
}
