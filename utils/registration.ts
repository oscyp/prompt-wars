import { invokeAuthenticatedFunction } from './supabase';
import type { SocialCredential } from './socialAuth';

export type AccountEligibility = {
  enabled: boolean;
  status: 'eligible' | 'needs_registration' | 'revoked' | 'deleted';
  can_play: boolean;
  can_generate: boolean;
  can_purchase: boolean;
  can_grant: boolean;
};
export type RegistrationState = {
  status:
    | 'eligible'
    | 'consent_required'
    | 'consent_unavailable'
    | 'pending'
    | 'approved'
    | 'denied'
    | 'expired'
    | 'revoked';
  registration_token: string;
  expires_at: string;
  hosted_url?: string;
};
export type RegistrationConfiguration = {
  enabled: boolean;
  minimum_client_version: string;
  guardian_consent_ready: boolean;
  guest_signup_enabled?: boolean;
};

const preAuth = { auth: 'registration' } as const;
export function getRegistrationConfiguration() {
  return invokeAuthenticatedFunction<RegistrationConfiguration>(
    'registration',
    { action: 'config' },
    preAuth,
  );
}
export function startRegistration(input: {
  birth_date: string;
  country: string;
  subdivision?: string;
}) {
  return invokeAuthenticatedFunction<RegistrationState>(
    'registration',
    { action: 'start', ...input },
    preAuth,
  );
}
export function checkRegistration(registrationToken: string) {
  return invokeAuthenticatedFunction<RegistrationState>(
    'registration',
    { action: 'status', registration_token: registrationToken },
    preAuth,
  );
}
export function authorizeRegistration(
  registrationToken: string,
  identity: { email: string } | SocialCredential | { provider: 'anonymous' },
) {
  const payload =
    'email' in identity
      ? { provider: 'email', email: identity.email }
      : identity.provider === 'anonymous'
        ? { provider: 'anonymous' }
        : {
            provider: identity.provider,
            id_token: identity.idToken,
            nonce: identity.nonce,
          };
  return invokeAuthenticatedFunction<{
    authorized: true;
    authorization_id?: string;
    authorization_token?: string;
    permit_expires_at: string;
  }>(
    'registration',
    { action: 'authorize', registration_token: registrationToken, ...payload },
    preAuth,
  );
}
export function getAccountEligibility() {
  return invokeAuthenticatedFunction<AccountEligibility>('eligibility', {
    action: 'status',
  });
}
export function completeExistingEligibility(
  registrationToken: string,
  expectedAccountId: string,
) {
  return invokeAuthenticatedFunction<AccountEligibility>(
    'eligibility',
    {
      action: 'complete',
      registration_token: registrationToken,
    },
    { expectedAccountId },
  );
}
