import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  handleRegistration,
  type RegistrationDependencies,
} from '../_shared/registration-service.ts';
import { createGuardianConsentProvider } from '../_shared/guardian-consent.ts';

const policy = {
  id: 'reviewed-policy',
  country: 'ZZ',
  subdivision: '',
  version: 'test',
  approved_at: '2026-09-01',
  minimum_age: 13,
  independent_consent_age: 16,
  requires_subdivision: false,
  assurance: 'declared',
  teen_purchases: false,
  processing_allowed: true,
};
function fixture() {
  const calls: { name: string; args?: Record<string, unknown> }[] = [];
  const deps: RegistrationDependencies = {
    now: () => new Date('2026-09-22T12:00:00Z'),
    guardian: createGuardianConsentProvider(),
    networkHash: async () => 'private-network-hash',
    verifyIdentity: async () => 'verified-subject',
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'auth_release_configuration')
        return { enabled: true, minimum_client_version: '1.4.0' };
      if (name === 'registration_policy') return policy;
      if (name === 'create_registration_session') return 'session-id';
      if (name === 'get_registration_context')
        return {
          id: 'session-id',
          status: 'eligible',
          policy,
          expires_at: '2026-09-23T12:00:00Z',
        };
      if (name === 'authorize_registration')
        return { authorized: true, authorization_id: 'permit-id' };
      throw new Error('unexpected RPC');
    },
  };
  return { deps, calls };
}
const request = (body: unknown) =>
  new Request('https://example.test/registration', {
    method: 'POST',
    body: JSON.stringify(body),
  });

Deno.test('guest config requires both rollout switches', async () => {
  for (const [enabled, guest, expected] of [
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [true, undefined, false],
    [true, 'true', false],
  ] as const) {
    const { deps } = fixture();
    deps.rpc = async () => ({ enabled, guest_signup_enabled: guest });
    const response = await handleRegistration(
      request({ action: 'config' }),
      deps,
    );
    assertEquals((await response.json()).guest_signup_enabled, expected);
  }
});

Deno.test(
  'guest authorization returns a short-lived bearer permit after eligibility',
  async () => {
    const { deps, calls } = fixture();
    const rpc = deps.rpc;
    deps.rpc = (name, args) => {
      if (name === 'auth_release_configuration')
        return Promise.resolve({ enabled: true, guest_signup_enabled: true });
      if (name === 'authorize_registration') {
        if (args?.p_provider !== 'anonymous' || args.p_subject !== 'anonymous')
          throw new Error('guest identity must be server-controlled');
        return Promise.resolve({
          authorized: true,
          authorization_id: 'permit-id',
          authorization_token: 'b'.repeat(64),
          permit_expires_at: '2026-09-22T12:05:00Z',
        });
      }
      return rpc(name, args);
    };
    deps.verifyIdentity = async () => {
      throw new Error('guest must not need an external identity');
    };
    const response = await handleRegistration(
      request({
        action: 'authorize',
        registration_token: 'a'.repeat(64),
        provider: 'anonymous',
        subject: 'attacker-input',
      }),
      deps,
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      authorized: true,
      authorization_id: 'permit-id',
      authorization_token: 'b'.repeat(64),
      permit_expires_at: '2026-09-22T12:05:00Z',
    });
    assertEquals(
      calls.some((c) => c.name === 'get_registration_context'),
      true,
    );
  },
);

Deno.test(
  'guest intake fails closed when disabled and never skips consent',
  async () => {
    for (const mode of ['disabled', 'missing', 'pending', 'expired'] as const) {
      const { deps, calls } = fixture();
      const rpc = deps.rpc;
      deps.rpc = (name, args) => {
        if (name === 'auth_release_configuration')
          return Promise.resolve({
            enabled: true,
            guest_signup_enabled:
              mode === 'missing' ? undefined : mode !== 'disabled',
          });
        if (name === 'get_registration_context')
          return Promise.resolve({
            id: 'session-id',
            policy,
            status: mode === 'pending' ? 'pending' : 'eligible',
            expires_at:
              mode === 'expired'
                ? '2026-09-21T12:00:00Z'
                : '2026-09-23T12:00:00Z',
          });
        return rpc(name, args);
      };
      const response = await handleRegistration(
        request({
          action: 'authorize',
          registration_token: 'a'.repeat(64),
          provider: 'anonymous',
        }),
        deps,
      );
      assertEquals(
        response.status,
        mode === 'pending' ? 403 : mode === 'expired' ? 410 : 503,
      );
      assertEquals(
        (await response.json()).code,
        mode === 'pending'
          ? 'consent_required'
          : mode === 'expired'
            ? 'registration_expired'
            : 'registration_unavailable',
      );
      assertEquals(
        calls.some((c) => c.name === 'authorize_registration'),
        false,
      );
    }
  },
);
Deno.test(
  'registration fails closed on malformed release or expiry data',
  async () => {
    for (const malformed of ['release', 'expiry'] as const) {
      const { deps, calls } = fixture();
      const rpc = deps.rpc;
      deps.rpc = (name, args) => {
        if (malformed === 'release' && name === 'auth_release_configuration')
          return Promise.resolve({ enabled: 'false' });
        if (malformed === 'expiry' && name === 'get_registration_context')
          return Promise.resolve({
            status: 'eligible',
            expires_at: 'not-a-date',
          });
        return rpc(name, args);
      };
      const response = await handleRegistration(
        request({
          action: 'authorize',
          registration_token: 'a'.repeat(64),
          provider: 'email',
          email: 'test@example.com',
        }),
        deps,
      );
      assertEquals(response.status, malformed === 'release' ? 503 : 410);
      assertEquals(
        calls.some((call) => call.name === 'authorize_registration'),
        false,
      );
    }
  },
);
Deno.test(
  'under-13 intake rejects before policy/session/identity writes',
  async () => {
    const { deps, calls } = fixture();
    const res = await handleRegistration(
      request({ action: 'start', birth_date: '2014-01-01', country: 'ZZ' }),
      deps,
    );
    assertEquals(res.status, 403);
    assertEquals((await res.json()).code, 'underage');
    assertEquals(
      calls.map((c) => c.name),
      ['auth_release_configuration'],
    );
  },
);
Deno.test(
  'permitted registration stores only age transition data and opaque secret hash',
  async () => {
    const { deps, calls } = fixture();
    const res = await handleRegistration(
      request({ action: 'start', birth_date: '2000-01-01', country: 'ZZ' }),
      deps,
    );
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.status, 'eligible');
    const write = calls.find(
      (c) => c.name === 'create_registration_session',
    )!.args!;
    assertEquals(write.p_age, 26);
    assertEquals(write.p_next_birthday, '2027-01-01');
    assertEquals(JSON.stringify(write).includes('2000-01-01'), false);
    assertEquals(
      JSON.stringify(write).includes(data.registration_token),
      false,
    );
  },
);
Deno.test(
  'missing reviewed policy and missing consent never authorize signup',
  async () => {
    const { deps, calls } = fixture();
    const teen = await handleRegistration(
      request({ action: 'start', birth_date: '2012-01-01', country: 'ZZ' }),
      deps,
    );
    assertEquals((await teen.json()).status, 'consent_unavailable');
    assertEquals(
      calls.some((c) => c.name === 'authorize_registration'),
      false,
    );
    const rpc = deps.rpc;
    deps.rpc = (name, args) =>
      name === 'registration_policy' ? Promise.resolve(null) : rpc(name, args);
    const absent = await handleRegistration(
      request({ action: 'start', birth_date: '2000-01-01', country: 'ZZ' }),
      deps,
    );
    assertEquals(absent.status, 403);
    assertEquals((await absent.json()).code, 'region_unavailable');
  },
);
Deno.test(
  'provider authorization binds verified subject, never client-submitted subject',
  async () => {
    const { deps, calls } = fixture();
    const response = await handleRegistration(
      request({
        action: 'authorize',
        registration_token: 'a'.repeat(64),
        provider: 'google',
        id_token: 'signed-token',
        nonce: 'raw-nonce',
        subject: 'attacker-subject',
      }),
      deps,
    );
    assertEquals(response.status, 200);
    assertEquals(calls.at(-1)?.args?.p_subject, 'verified-subject');
    deps.verifyIdentity = async () => {
      throw new Error('secret-token');
    };
    const failed = await handleRegistration(
      request({
        action: 'authorize',
        registration_token: 'a'.repeat(64),
        provider: 'google',
      }),
      deps,
    );
    assertEquals(failed.status, 503);
    assertEquals((await failed.text()).includes('secret-token'), false);
  },
);
Deno.test(
  'status rejects client approval and expired registration',
  async () => {
    const { deps } = fixture();
    const rpc = deps.rpc;
    deps.rpc = (name, args) =>
      name === 'get_registration_context'
        ? Promise.resolve({
            id: 'session-id',
            status: 'pending',
            policy,
            expires_at: '2026-09-23T12:00:00Z',
          })
        : rpc(name, args);
    const pending = await handleRegistration(
      request({
        action: 'status',
        registration_token: 'a'.repeat(64),
        approved: true,
      }),
      deps,
    );
    assertEquals((await pending.json()).status, 'consent_unavailable');
    deps.rpc = (name, args) =>
      name === 'get_registration_context'
        ? Promise.resolve(null)
        : rpc(name, args);
    assertEquals(
      (
        await handleRegistration(
          request({
            action: 'authorize',
            registration_token: 'a'.repeat(64),
            provider: 'email',
            email: 'test@example.com',
          }),
          deps,
        )
      ).status,
      410,
    );
  },
);
