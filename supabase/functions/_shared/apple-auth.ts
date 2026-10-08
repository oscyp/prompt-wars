import {
  createRemoteJWKSet,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
} from 'https://esm.sh/jose@6.1.3';
import { createServiceClient } from './utils.ts';

const APPLE_ISSUER = 'https://appleid.apple.com';
const appleKeys = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`), {
  timeoutDuration: 8000,
});
const encoder = new TextEncoder();

export class AppleAuthError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(code);
  }
}

export interface AppleConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  encryptionKey: string;
}

export function readAppleConfig(): AppleConfig {
  const config = {
    clientId: Deno.env.get('APPLE_SIGN_IN_CLIENT_ID')?.trim() ?? '',
    teamId: Deno.env.get('APPLE_SIGN_IN_TEAM_ID')?.trim() ?? '',
    keyId: Deno.env.get('APPLE_SIGN_IN_KEY_ID')?.trim() ?? '',
    privateKey: (Deno.env.get('APPLE_SIGN_IN_PRIVATE_KEY') ?? '').replace(
      /\\n/g,
      '\n',
    ),
    encryptionKey: Deno.env.get('APPLE_SIGN_IN_ENCRYPTION_KEY')?.trim() ?? '',
  };
  if (Object.values(config).some((value) => !value)) {
    throw new AppleAuthError('apple_not_configured');
  }
  return config;
}

interface AppleUser {
  id: string;
  identities?: { provider: string; identity_data?: Record<string, unknown> }[];
}

export function resolveAppleSubject(user: AppleUser): string {
  const subjects =
    user.identities
      ?.filter((identity) => identity.provider === 'apple')
      .map((identity) => identity.identity_data?.sub)
      .filter(
        (subject): subject is string =>
          typeof subject === 'string' && subject.length > 0,
      ) ?? [];
  if (subjects.length !== 1)
    throw new AppleAuthError('apple_identity_required', 403);
  return subjects[0];
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function verifyAppleIdentityToken(
  token: string,
  expected: { clientId: string; nonce: string; appleSubject: string },
  verificationKey: JWTVerifyGetKey = appleKeys,
): Promise<void> {
  try {
    const { payload } = await jwtVerify(token, verificationKey, {
      issuer: APPLE_ISSUER,
      audience: expected.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
    });
    if (
      payload.sub !== expected.appleSubject ||
      payload.nonce !== (await sha256Hex(expected.nonce))
    ) {
      throw new Error('Identity binding mismatch');
    }
  } catch {
    // Never include token contents or upstream JWT parser messages in logs/responses.
    throw new AppleAuthError('apple_identity_invalid', 403);
  }
}

interface CredentialContext {
  userId: string;
  appleSubject: string;
  clientId: string;
}
export interface AppleCredential extends CredentialContext {
  codeHash: string;
  encryptedRefreshToken: string;
}
export interface AppleCredentialStore {
  hasStoredCode(userId: string, codeHash: string): Promise<boolean>;
  storeCredential(credential: AppleCredential): Promise<'stored' | 'queued'>;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function associatedData(context: CredentialContext): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    JSON.stringify([context.userId, context.appleSubject, context.clientId]),
  );
}
async function encryptionKey(value: string): Promise<CryptoKey> {
  try {
    const bytes = fromBase64(value);
    if (bytes.length !== 32) throw new Error('Key length');
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    throw new AppleAuthError('apple_encryption_configuration_invalid');
  }
}

export async function encryptAppleRefreshToken(
  token: string,
  key: string,
  context: CredentialContext,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(context) },
    await encryptionKey(key),
    encoder.encode(token),
  );
  return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptAppleRefreshToken(
  value: string,
  key: string,
  context: CredentialContext,
): Promise<string> {
  try {
    const [version, iv, ciphertext, extra] = value.split('.');
    if (version !== 'v1' || !iv || !ciphertext || extra)
      throw new Error('Envelope');
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(iv),
        additionalData: associatedData(context),
      },
      await encryptionKey(key),
      fromBase64(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new AppleAuthError('apple_credential_decryption_failed');
  }
}

async function clientSecret(config: AppleConfig): Promise<string> {
  try {
    const key = await importPKCS8(config.privateKey, 'ES256');
    return await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setAudience(APPLE_ISSUER)
      .setSubject(config.clientId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
  } catch {
    throw new AppleAuthError('apple_signing_configuration_invalid');
  }
}

async function appleRequest(
  path: 'token' | 'revoke',
  config: AppleConfig,
  fields: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: await clientSecret(config),
    ...fields,
  });
  try {
    return await fetchImpl(`${APPLE_ISSUER}/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppleAuthError('apple_unavailable');
  }
}

export async function retainAppleAuthorization(
  input: { authorizationCode: string; nonce: string; user: AppleUser },
  deps: {
    config: AppleConfig;
    store: AppleCredentialStore;
    fetchImpl?: typeof fetch;
    verificationKey?: JWTVerifyGetKey;
  },
): Promise<'stored' | 'already_stored' | 'queued'> {
  const appleSubject = resolveAppleSubject(input.user);
  if (
    !input.authorizationCode ||
    input.authorizationCode.length > 4096 ||
    input.nonce.length < 16 ||
    input.nonce.length > 1024
  ) {
    throw new AppleAuthError('apple_request_invalid', 400);
  }
  // Bind idempotency to the nonce as well: a replay with the wrong nonce must fail.
  const codeHash = await sha256Hex(
    JSON.stringify([input.authorizationCode, input.nonce]),
  );
  if (await deps.store.hasStoredCode(input.user.id, codeHash))
    return 'already_stored';
  // Validate encryption configuration before consuming the single-use code.
  await encryptionKey(deps.config.encryptionKey);
  const response = await appleRequest(
    'token',
    deps.config,
    {
      code: input.authorizationCode,
      grant_type: 'authorization_code',
    },
    deps.fetchImpl ?? fetch,
  );
  if (!response.ok) {
    // Concurrent duplicate requests can finish the first exchange during this one.
    if (await deps.store.hasStoredCode(input.user.id, codeHash))
      return 'already_stored';
    throw new AppleAuthError(
      response.status >= 500 ? 'apple_unavailable' : 'apple_code_invalid',
      response.status >= 500 ? 503 : 400,
    );
  }
  let data: { id_token?: unknown; refresh_token?: unknown };
  try {
    data = await response.json();
  } catch {
    throw new AppleAuthError('apple_response_invalid');
  }
  if (
    typeof data.id_token !== 'string' ||
    typeof data.refresh_token !== 'string' ||
    !data.refresh_token
  ) {
    throw new AppleAuthError('apple_response_invalid');
  }
  await verifyAppleIdentityToken(
    data.id_token,
    {
      clientId: deps.config.clientId,
      appleSubject,
      nonce: input.nonce,
    },
    deps.verificationKey,
  );
  const context = {
    userId: input.user.id,
    appleSubject,
    clientId: deps.config.clientId,
  };
  return await deps.store.storeCredential({
    ...context,
    codeHash,
    encryptedRefreshToken: await encryptAppleRefreshToken(
      data.refresh_token,
      deps.config.encryptionKey,
      context,
    ),
  });
}

export function createAppleCredentialStore(
  supabase = createServiceClient(),
): AppleCredentialStore {
  return {
    async hasStoredCode(userId, codeHash) {
      const { data, error } = await supabase.rpc(
        'has_apple_authorization_code',
        { p_user_id: userId, p_code_hash: codeHash },
      );
      if (error) throw new AppleAuthError('apple_storage_unavailable');
      return data === true;
    },
    async storeCredential(value) {
      const { data, error } = await supabase.rpc('store_apple_authorization', {
        p_user_id: value.userId,
        p_apple_subject: value.appleSubject,
        p_client_id: value.clientId,
        p_code_hash: value.codeHash,
        p_encrypted_refresh_token: value.encryptedRefreshToken,
      });
      if (error || (data !== 'stored' && data !== 'queued'))
        throw new AppleAuthError('apple_storage_unavailable');
      return data;
    },
  };
}

export interface AppleRevocationJob extends CredentialContext {
  id: string;
  leaseToken: string;
  encryptedRefreshToken: string;
}
export interface AppleRevocationStore {
  claim(userId?: string): Promise<AppleRevocationJob[]>;
  finish(job: AppleRevocationJob, errorCode: string | null): Promise<void>;
}

export async function processAppleRevocations(
  deps: {
    config: AppleConfig;
    store: AppleRevocationStore;
    fetchImpl?: typeof fetch;
  },
  userId?: string,
): Promise<{ revoked: number; retrying: number }> {
  const jobs = await deps.store.claim(userId);
  let revoked = 0;
  let retrying = 0;
  for (const job of jobs) {
    let failure: string | null = null;
    try {
      // Use the client ID saved at token exchange, even after future app configuration changes.
      const config = { ...deps.config, clientId: job.clientId };
      const token = await decryptAppleRefreshToken(
        job.encryptedRefreshToken,
        config.encryptionKey,
        job,
      );
      const response = await appleRequest(
        'revoke',
        config,
        { token, token_type_hint: 'refresh_token' },
        deps.fetchImpl ?? fetch,
      );
      if (response.status !== 200)
        throw new AppleAuthError('apple_revocation_rejected');
    } catch (error) {
      failure =
        error instanceof AppleAuthError
          ? error.code
          : 'apple_revocation_failed';
    }
    // A completion failure leaves the lease to expire; Apple revocation is idempotent.
    await deps.store.finish(job, failure);
    if (failure) retrying++;
    else revoked++;
  }
  return { revoked, retrying };
}

export function createAppleRevocationStore(
  supabase = createServiceClient(),
): AppleRevocationStore {
  return {
    async claim(userId) {
      const { data, error } = await supabase.rpc('claim_apple_revocations', {
        p_user_id: userId ?? null,
        p_limit: userId ? 5 : 10,
      });
      if (error) throw new AppleAuthError('apple_storage_unavailable');
      return (data ?? []).map((row: Record<string, string>) => ({
        id: row.id,
        leaseToken: row.lease_token,
        userId: row.user_id,
        appleSubject: row.apple_subject,
        clientId: row.client_id,
        encryptedRefreshToken: row.encrypted_refresh_token,
      }));
    },
    async finish(job, errorCode) {
      const { error } = await supabase.rpc('finish_apple_revocation', {
        p_job_id: job.id,
        p_lease_token: job.leaseToken,
        p_error_code: errorCode,
      });
      if (error) throw new AppleAuthError('apple_storage_unavailable');
    },
  };
}
