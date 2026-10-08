/**
 * KWS Parent Verification is adult verification, not parental consent.
 * The separate Consent Management service needs product-specific onboarding.
 * See docs/KWS_SETUP.md for the confirmed provider contract and release gate.
 */
export interface HostedGuardianConsentRequest {
  registrationId: string;
  guardianEmail: string;
  policyVersion: string;
  countryCode: string;
  language: string;
}

export interface GuardianConsentReference {
  registrationId: string;
  providerReference: string;
  policyVersion: string;
}

export interface HostedGuardianConsentSession {
  provider: 'kws';
  providerReference: string;
  hostedUrl: string;
  expiresAt: string;
}

/** Application contract for a future confirmed CM adapter, not a KWS wire format. */
export interface VerifiedGuardianConsentEvidence extends GuardianConsentReference {
  source: 'kws_consent_management';
  guardianVerified: true;
  consentGranted: true;
  evidenceReference: string;
  grantedAt: string;
}

export type GuardianConsentDecision =
  | { status: 'pending' | 'denied' | 'expired' | 'revoked' }
  | { status: 'approved'; evidence: VerifiedGuardianConsentEvidence };

export interface GuardianConsentReadiness {
  provider: 'kws';
  ready: false;
  reason: 'kws_consent_management_not_configured';
}

export interface GuardianConsentProvider {
  readonly provider: 'kws';
  readiness(): GuardianConsentReadiness;
  startHostedConsent(
    request: HostedGuardianConsentRequest,
  ): Promise<HostedGuardianConsentSession>;
  checkConsent(
    reference: GuardianConsentReference,
  ): Promise<GuardianConsentDecision>;
}

export class GuardianConsentUnavailableError extends Error {
  readonly code = 'consent_unavailable';

  constructor() {
    super(
      'KWS Consent Management onboarding and verified integration are required.',
    );
    this.name = 'GuardianConsentUnavailableError';
  }
}

export function createGuardianConsentProvider(): GuardianConsentProvider {
  // Credentials for PV, a client redirect, or a feature flag cannot turn this
  // into CM. Enable only after implementing the onboarded, confirmed protocol.
  return {
    provider: 'kws',
    readiness: () => ({
      provider: 'kws',
      ready: false,
      reason: 'kws_consent_management_not_configured',
    }),
    startHostedConsent: () =>
      Promise.reject(new GuardianConsentUnavailableError()),
    checkConsent: () => Promise.reject(new GuardianConsentUnavailableError()),
  };
}

export interface KwsParentVerificationOptions {
  organizationId: string;
  productId: string | null;
  /** Current and optionally previous webhook secret during provider rotation. */
  webhookSecrets: readonly string[];
  /** Epoch milliseconds; defaults to Date.now. */
  now?: () => number;
}

export interface KwsParentVerificationEvent {
  provider: 'kws';
  kind: 'parent_verification';
  adultVerified: true;
  consentGranted: false;
  registrationId: string;
  policyVersion: string;
  /** For comparing to the pending request only; never log this event object. */
  guardianEmail: string;
  providerReference: string;
  occurredAt: string;
  /** Must be deduplicated atomically with any caller-owned state transition. */
  replayKey: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Verify x-kws-signature against the unmodified UTF-8 POST body. The documented
 * signing input is `${timestamp}.${rawBody}` with HMAC-SHA256 and hex encoding.
 * The 5-minute age / 30-second future-skew windows are our local replay policy,
 * not KWS-specified delivery guarantees. A durable replayKey claim is still
 * required in the same transaction as the caller's state change.
 *
 * This function does not authenticate redirects, fetch status, or grant consent.
 */
export async function verifyKwsParentVerificationWebhook(
  rawBody: string,
  signatureHeader: string | null,
  options: KwsParentVerificationOptions,
): Promise<KwsParentVerificationEvent | null> {
  if (
    !signatureHeader ||
    signatureHeader.length > 2048 ||
    rawBody.length > 16_384
  )
    return null;
  if (
    !UUID.test(options.organizationId) ||
    (options.productId !== null && !UUID.test(options.productId))
  )
    return null;
  const secrets = options.webhookSecrets.filter(
    (secret) => typeof secret === 'string' && secret.trim().length > 0,
  );
  if (secrets.length === 0 || secrets.length > 4) return null;

  const fields = signatureHeader.split(',').map((field) => field.trim());
  const timestamps = fields.filter((field) => field.startsWith('t='));
  const signatures = fields.filter((field) => /^v1=[a-f0-9]{64}$/i.test(field));
  if (
    timestamps.length !== 1 ||
    !/^t=\d{1,12}$/.test(timestamps[0]) ||
    signatures.length === 0 ||
    signatures.length > 4
  )
    return null;
  const timestamp = timestamps[0].slice(2);
  const ageSeconds = (options.now?.() ?? Date.now()) / 1000 - Number(timestamp);
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300 || ageSeconds < -30)
    return null;

  const encoder = new TextEncoder();
  const message = encoder.encode(`${timestamp}.${rawBody}`);
  let authenticated = false;
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    for (const signature of signatures) {
      const bytes = Uint8Array.from(
        signature.slice(3).match(/.{2}/g)!,
        (byte) => parseInt(byte, 16),
      );
      if (await crypto.subtle.verify('HMAC', key, bytes, message))
        authenticated = true;
    }
  }
  if (!authenticated) return null;

  // Parse only authenticated data and return an allowlist, never the raw event.
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (
    !record(event) ||
    event.name !== 'parent-verified' ||
    event.orgId !== options.organizationId ||
    event.productId !== options.productId
  )
    return null;
  if (
    typeof event.time !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(event.time) ||
    !Number.isFinite(Date.parse(event.time))
  )
    return null;
  const payload = event.payload;
  if (
    !record(payload) ||
    !record(payload.status) ||
    payload.status.verified !== true
  )
    return null;
  if (
    typeof payload.status.transactionId !== 'string' ||
    !/^[\x21-\x7e]{1,200}$/.test(payload.status.transactionId)
  )
    return null;
  if (
    typeof payload.parentEmail !== 'string' ||
    payload.parentEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.parentEmail)
  )
    return null;
  if (
    typeof payload.externalPayload !== 'string' ||
    payload.externalPayload.length > 250
  )
    return null;
  let binding: unknown;
  try {
    binding = JSON.parse(payload.externalPayload);
  } catch {
    return null;
  }
  if (
    !record(binding) ||
    typeof binding.registrationId !== 'string' ||
    !UUID.test(binding.registrationId)
  )
    return null;
  if (
    typeof binding.policyVersion !== 'string' ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(binding.policyVersion)
  )
    return null;

  return {
    provider: 'kws',
    kind: 'parent_verification',
    adultVerified: true,
    consentGranted: false,
    registrationId: binding.registrationId,
    policyVersion: binding.policyVersion,
    guardianEmail: payload.parentEmail,
    providerReference: payload.status.transactionId,
    occurredAt: new Date(event.time).toISOString().replace('.000Z', 'Z'),
    replayKey: `kws:parent-verified:${event.orgId}:${event.productId ?? ''}:${encodeURIComponent(payload.status.transactionId)}`,
  };
}
