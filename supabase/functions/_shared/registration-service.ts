import { createServiceClient, corsHeaders } from './utils.ts';
import {
  ageAtDate,
  assessRegistration,
  digestRegistrationSecret,
  parseRegion,
  RegistrationError,
  type JurisdictionPolicy,
} from './registration-policy.ts';
import {
  createGuardianConsentProvider,
  type GuardianConsentProvider,
} from './guardian-consent.ts';
import { verifyRegistrationIdentity } from './provider-identity.ts';

export interface RegistrationDependencies {
  rpc(name: string, args?: Record<string, unknown>): Promise<unknown>;
  now(): Date;
  guardian: GuardianConsentProvider;
  networkHash(req: Request): Promise<string>;
  verifyIdentity(
    provider: 'apple' | 'google',
    token: unknown,
    nonce: unknown,
  ): Promise<string>;
}
export async function registrationRpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await createServiceClient().rpc(name, args);
  if (error) {
    const allowed = [
      'registration_required',
      'registration_already_bound',
      'consent_required',
      'region_unavailable',
      'registration_unavailable',
      'registration_rate_limited',
      'eligibility_already_recorded',
      'account_unavailable',
    ];
    const code = allowed.find((value) => error.message === value);
    throw new RegistrationError(
      code ?? 'registration_unavailable',
      code === 'registration_rate_limited' ? 429 : code ? 403 : 503,
    );
  }
  return data;
}
const defaults: RegistrationDependencies = {
  rpc: registrationRpc,
  now: () => new Date(),
  guardian: createGuardianConsentProvider(),
  verifyIdentity: verifyRegistrationIdentity,
  networkHash: async (req) => {
    const secret = Deno.env.get('REGISTRATION_NETWORK_HMAC_KEY') ?? '';
    // These headers must be overwritten by the trusted ingress, never forwarded
    // unmodified from a caller. Missing trusted network evidence fails closed.
    const address =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (secret.length < 32 || !address || address.length > 100)
      throw new RegistrationError('registration_unavailable', 503);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(address),
    );
    return Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  },
};
export function registrationResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
export function registrationFailure(error: unknown) {
  const e =
    error instanceof RegistrationError
      ? error
      : new RegistrationError('registration_unavailable', 503);
  return registrationResponse({ error: e.code, code: e.code }, e.status);
}
export async function readRegistrationBody(
  req: Request,
): Promise<Record<string, unknown>> {
  if (req.method !== 'POST')
    throw new RegistrationError('method_not_allowed', 405);
  // Bound the stream itself, not only a caller-controlled Content-Length.
  const reader = req.body?.getReader();
  if (!reader) throw new RegistrationError('invalid_request');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 24_576) {
        await reader.cancel();
        throw new RegistrationError('request_too_large', 413);
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const result = JSON.parse(new TextDecoder().decode(joined));
    if (!result || typeof result !== 'object' || Array.isArray(result))
      throw new Error('Invalid shape');
    return result;
  } catch (error) {
    if (error instanceof RegistrationError) throw error;
    throw new RegistrationError('invalid_request');
  } finally {
    reader.releaseLock();
  }
}
export async function registrationTokenHash(token: unknown): Promise<string> {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))
    throw new RegistrationError('registration_required', 403);
  return digestRegistrationSecret(token);
}
type RegistrationContext = {
  id: string;
  status: string;
  policy: JurisdictionPolicy;
  expires_at: string;
  consent_reference?: string;
};

export async function handleRegistration(
  req: Request,
  deps = defaults,
): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { headers: corsHeaders });
  try {
    const body = await readRegistrationBody(req);
    const config = (await deps.rpc('auth_release_configuration')) as {
      enabled: boolean;
      guest_signup_enabled?: boolean;
      minimum_client_version: string;
    } | null;
    if (body.action === 'config')
      return registrationResponse({
        enabled: config?.enabled === true,
        guest_signup_enabled:
          config?.enabled === true && config?.guest_signup_enabled === true,
        minimum_client_version: config?.minimum_client_version ?? '',
        guardian_consent_ready: deps.guardian.readiness().ready,
      });
    if (config?.enabled !== true)
      throw new RegistrationError('registration_unavailable', 503);
    if (body.action === 'start') {
      // Do not persist, authorize an identity, or contact a provider for under-13s.
      if (ageAtDate(body.birth_date, deps.now()) < 13)
        throw new RegistrationError('underage', 403);
      const region = parseRegion(body.country, body.subdivision ?? '');
      const policy = (await deps.rpc('registration_policy', {
        p_country: region.country,
        p_subdivision: region.subdivision,
      })) as JurisdictionPolicy | null;
      const assessment = assessRegistration(
        body.birth_date,
        policy,
        deps.now(),
      );
      if (
        assessment.status !== 'eligible' &&
        assessment.status !== 'consent_required'
      )
        throw new RegistrationError(assessment.status, 403);
      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      const pending = assessment.status === 'consent_required';
      await deps.rpc('create_registration_session', {
        p_token_hash: await digestRegistrationSecret(token),
        p_network_hash: await deps.networkHash(req),
        p_policy_id: policy!.id,
        p_age: assessment.age,
        p_next_birthday: assessment.nextBirthday,
        p_status: pending ? 'pending' : 'eligible',
        p_grant_eligible: true,
      });
      return registrationResponse({
        registration_token: token,
        status: pending ? 'consent_unavailable' : 'eligible',
        expires_at: new Date(deps.now().getTime() + 86_400_000).toISOString(),
      });
    }
    if (body.action !== 'status' && body.action !== 'authorize')
      throw new RegistrationError('invalid_action');
    const hash = await registrationTokenHash(body.registration_token);
    const context = (await deps.rpc('get_registration_context', {
      p_token_hash: hash,
    })) as RegistrationContext | null;
    const expiresAt = context ? Date.parse(context.expires_at) : NaN;
    if (
      !context ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= deps.now().getTime()
    )
      throw new RegistrationError('registration_expired', 410);
    if (body.action === 'status') {
      // No redirect/status parameter can grant consent. The onboarded CM adapter
      // must provide independently verified evidence before this can progress.
      return registrationResponse({
        registration_token: body.registration_token,
        expires_at: context.expires_at,
        status:
          context.status === 'pending' ? 'consent_unavailable' : context.status,
      });
    }
    if (!['eligible', 'approved'].includes(context.status))
      throw new RegistrationError('consent_required', 403);
    let subject: string;
    if (body.provider === 'anonymous') {
      if (config.guest_signup_enabled !== true)
        throw new RegistrationError('registration_unavailable', 503);
      // The database issues the bearer permit; no client identity is trusted.
      subject = 'anonymous';
    } else if (body.provider === 'email') {
      subject =
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (subject.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject))
        throw new RegistrationError('invalid_email');
    } else if (body.provider === 'apple' || body.provider === 'google') {
      subject = await deps.verifyIdentity(
        body.provider,
        body.id_token,
        body.nonce,
      );
    } else throw new RegistrationError('invalid_provider');
    return registrationResponse(
      await deps.rpc('authorize_registration', {
        p_token_hash: hash,
        p_provider: body.provider,
        p_subject: subject,
      }),
    );
  } catch (error) {
    return registrationFailure(error);
  }
}
