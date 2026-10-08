import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  handleDeleteAccount,
  type DeleteAccountDependencies,
} from '../delete-account/index.ts';
import { handleAppleRevocations } from '../process-apple-revocations/index.ts';
import {
  encryptAppleRefreshToken,
  processAppleRevocations,
  type AppleRevocationJob,
} from '../_shared/apple-auth.ts';
import { exportPKCS8, generateKeyPair } from 'https://esm.sh/jose@6.1.3';

const request = () =>
  new Request('https://example.test/delete-account', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token' },
    body: JSON.stringify({ confirm: 'DELETE' }),
  });

function deletionDependencies(
  overrides: Partial<DeleteAccountDependencies> = {},
) {
  const actions: string[] = [];
  const deps: DeleteAccountDependencies = {
    getUserId: async () => 'user-id',
    prepareDeletion: async () => {
      actions.push('prepare');
      return { already_deleted: false, profile_missing: true };
    },
    deleteAuthUser: async () => {
      actions.push('delete-auth');
    },
    revokeApple: async () => {
      actions.push('revoke');
    },
    ...overrides,
  };
  return { actions, deps };
}

Deno.test(
  'account deletion captures durable work before deleting an identity with no profile',
  async () => {
    const { deps, actions } = deletionDependencies();
    const response = await handleDeleteAccount(request(), deps);
    assertEquals(response.status, 200);
    assertEquals((await response.json()).deleted, true);
    assertEquals(actions, ['prepare', 'delete-auth', 'revoke']);
  },
);

Deno.test(
  'scrub or durable capture failure keeps auth identity available for retry',
  async () => {
    const { deps, actions } = deletionDependencies({
      prepareDeletion: async () => {
        throw new Error('database secret');
      },
    });
    const response = await handleDeleteAccount(request(), deps);
    assertEquals(response.status, 500);
    assertEquals(actions, []);
    assertEquals((await response.text()).includes('database secret'), false);
  },
);

Deno.test(
  'auth deletion failure is retryable after durable capture and scrub',
  async () => {
    let attempts = 0;
    const { deps, actions } = deletionDependencies({
      deleteAuthUser: async () => {
        if (++attempts === 1) throw new Error('private token');
      },
    });
    const first = await handleDeleteAccount(request(), deps);
    assertEquals(first.status, 500);
    assertEquals(actions, ['prepare']);
    assertEquals((await first.text()).includes('private token'), false);
    assertEquals((await handleDeleteAccount(request(), deps)).status, 200);
    assertEquals(actions, ['prepare', 'prepare', 'revoke']);
  },
);

Deno.test(
  'Apple configuration or network failure never blocks completed account deletion',
  async () => {
    const { deps, actions } = deletionDependencies({
      revokeApple: async () => {
        throw new Error('private token');
      },
    });
    const response = await handleDeleteAccount(request(), deps);
    assertEquals(response.status, 200);
    assertEquals(actions, ['prepare', 'delete-auth']);
    assertEquals((await response.text()).includes('private token'), false);
  },
);

Deno.test(
  'worker rejects user tokens and accepts only configured service authorization',
  async () => {
    const previous = Deno.env.get('SUPABASE_SECRET_KEYS');
    Deno.env.set(
      'SUPABASE_SECRET_KEYS',
      JSON.stringify({ default: 'service-test-key' }),
    );
    let ran = 0;
    try {
      const rejectedHeaders: Record<string, string>[] = [
        {},
        { Authorization: 'Bearer user-token' },
        { apikey: 'sb_publishable_public' },
      ];
      for (const headers of rejectedHeaders) {
        const response = await handleAppleRevocations(
          new Request('https://example.test/worker', {
            method: 'POST',
            headers,
          }),
          async () => {
            ran++;
            return { revoked: 1, retrying: 0 };
          },
        );
        assertEquals(response.status, 401);
      }
      assertEquals(ran, 0);
      const response = await handleAppleRevocations(
        new Request('https://example.test/worker', {
          method: 'POST',
          headers: { apikey: 'service-test-key' },
        }),
        async () => {
          ran++;
          return { revoked: 1, retrying: 0 };
        },
      );
      assertEquals(response.status, 200);
      assertEquals(ran, 1);
    } finally {
      if (previous === undefined) Deno.env.delete('SUPABASE_SECRET_KEYS');
      else Deno.env.set('SUPABASE_SECRET_KEYS', previous);
    }
  },
);

Deno.test(
  'Apple revocation reports retry and safely retries a successful external call after storage failure',
  async () => {
    const signing = await generateKeyPair('ES256', { extractable: true });
    const encryptionKey = btoa(
      String.fromCharCode(...new Uint8Array(32).fill(3)),
    );
    const context = {
      userId: 'user-id',
      appleSubject: 'subject',
      clientId: 'saved-client-id',
    };
    const job: AppleRevocationJob = {
      ...context,
      id: 'job-id',
      leaseToken: 'lease-token',
      encryptedRefreshToken: await encryptAppleRefreshToken(
        'refresh-token',
        encryptionKey,
        context,
      ),
    };
    const config = {
      clientId: 'new-client-id',
      teamId: 'team',
      keyId: 'key',
      privateKey: await exportPKCS8(signing.privateKey),
      encryptionKey,
    };
    const finishes: (string | null)[] = [];
    const store = {
      claim: async () => [job],
      finish: async (_job: AppleRevocationJob, code: string | null) => {
        finishes.push(code);
      },
    };
    assertEquals(
      await processAppleRevocations({
        config,
        store,
        fetchImpl: async () => new Response(null, { status: 503 }),
      }),
      { revoked: 0, retrying: 1 },
    );
    assertEquals(finishes, ['apple_revocation_rejected']);
    // Apple documents 200 as revocation completed (including already revoked).
    // An unexpected merely-accepted response must retain the credential for retry.
    assertEquals(
      await processAppleRevocations({
        config,
        store,
        fetchImpl: async () => new Response(null, { status: 202 }),
      }),
      { revoked: 0, retrying: 1 },
    );
    let calls = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls++;
      const body = new URLSearchParams(String(init?.body));
      assertEquals(body.get('client_id'), 'saved-client-id');
      assertEquals(body.get('token'), 'refresh-token');
      return new Response(null, { status: 200 });
    };
    await assertRejects(() =>
      processAppleRevocations({
        config,
        fetchImpl,
        store: {
          ...store,
          finish: async () => {
            throw new Error('storage unavailable');
          },
        },
      }),
    );
    assertEquals(await processAppleRevocations({ config, fetchImpl, store }), {
      revoked: 1,
      retrying: 0,
    });
    assertEquals(calls, 2);
    assertEquals(finishes, [
      'apple_revocation_rejected',
      'apple_revocation_rejected',
      null,
    ]);
  },
);
