import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'https://esm.sh/jose@6.1.3';
import {
  digestRegistrationSecret,
  RegistrationError,
} from './registration-policy.ts';

const googleKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
  { timeoutDuration: 8000 },
);
const appleKeys = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
  { timeoutDuration: 8000 },
);
export interface RegistrationIdentityConfig {
  googleAudiences: readonly string[];
  appleAudience: string;
}
export function registrationIdentityConfig(): RegistrationIdentityConfig {
  return {
    googleAudiences: (Deno.env.get('GOOGLE_SIGN_IN_CLIENT_IDS') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    appleAudience: Deno.env.get('APPLE_SIGN_IN_CLIENT_ID')?.trim() ?? '',
  };
}

/** Only verified provider subjects can become registration authorizations. */
export async function verifyRegistrationIdentity(
  provider: 'apple' | 'google',
  token: unknown,
  nonce: unknown,
  config = registrationIdentityConfig(),
  verificationKey?: JWTVerifyGetKey,
): Promise<string> {
  const audience =
    provider === 'apple'
      ? [config.appleAudience].filter(Boolean)
      : config.googleAudiences;
  if (!audience.length)
    throw new RegistrationError('provider_unavailable', 503);
  if (
    typeof token !== 'string' ||
    token.length > 16_384 ||
    typeof nonce !== 'string' ||
    !/^[a-f0-9]{64}$/.test(nonce)
  ) {
    throw new RegistrationError('invalid_provider_identity', 403);
  }
  try {
    const { payload } = await jwtVerify(
      token,
      verificationKey ?? (provider === 'apple' ? appleKeys : googleKeys),
      {
        issuer:
          provider === 'apple'
            ? 'https://appleid.apple.com'
            : ['https://accounts.google.com', 'accounts.google.com'],
        audience: [...audience],
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
        maxTokenAge: '10m',
      },
    );
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      payload.sub.length > 320 ||
      payload.nonce !== (await digestRegistrationSecret(nonce))
    ) {
      throw new Error('Identity mismatch');
    }
    return payload.sub;
  } catch {
    throw new RegistrationError('invalid_provider_identity', 403);
  }
}
