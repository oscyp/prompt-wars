import {
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  exportPKCS8,
  generateKeyPair,
  SignJWT,
} from 'https://esm.sh/jose@6.1.3';
import {
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  resolveAppleSubject,
  retainAppleAuthorization,
  sha256Hex,
  verifyAppleIdentityToken,
  type AppleConfig,
  type AppleCredential,
  type AppleCredentialStore,
} from '../_shared/apple-auth.ts';

const subject = 'apple-subject-a';
const clientId = 'com.promptwars.app';
const rawNonce = 'random-raw-nonce-at-least-32-bytes-long';
const user = {
  id: 'user-a',
  identities: [{ provider: 'apple', identity_data: { sub: subject } }],
};
const context = { userId: user.id, appleSubject: subject, clientId };
const encryptionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(11)));
const rsa = await generateKeyPair('RS256');
const signing = await generateKeyPair('ES256', { extractable: true });
const config: AppleConfig = {
  clientId,
  teamId: 'TEAMID',
  keyId: 'KEYID',
  privateKey: await exportPKCS8(signing.privateKey),
  encryptionKey,
};

async function idToken(
  overrides: Record<string, unknown> = {},
  key = rsa.privateKey,
) {
  return await new SignJWT({ nonce: await sha256Hex(rawNonce), ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'apple-key' })
    .setIssuer(
      typeof overrides.iss === 'string'
        ? overrides.iss
        : 'https://appleid.apple.com',
    )
    .setAudience(typeof overrides.aud === 'string' ? overrides.aud : clientId)
    .setSubject(typeof overrides.sub === 'string' ? overrides.sub : subject)
    .setIssuedAt()
    .setExpirationTime(typeof overrides.exp === 'number' ? overrides.exp : '5m')
    .sign(key);
}

Deno.test(
  'Apple ownership uses server identity data, never editable metadata',
  () => {
    assertEquals(resolveAppleSubject(user), subject);
    assertThrows(() =>
      resolveAppleSubject({
        id: 'bad',
        identities: [{ provider: 'email', identity_data: { sub: subject } }],
      }),
    );
    assertThrows(() =>
      resolveAppleSubject({
        id: 'bad',
        identities: [{ provider: 'apple', identity_data: {} }],
      }),
    );
  },
);

Deno.test(
  'Apple token must have a valid signature, issuer, audience, expiry, nonce, and caller subject',
  async () => {
    const options = { clientId, nonce: rawNonce, appleSubject: subject };
    await verifyAppleIdentityToken(
      await idToken(),
      options,
      async () => rsa.publicKey,
    );
    for (const overrides of [
      { iss: 'https://attacker.example' },
      { aud: 'other.app' },
      { sub: 'another-users-apple-subject' },
      { nonce: 'wrong' },
      { nonce: undefined },
      { exp: 1 },
    ]) {
      const idTokenString = await idToken(overrides);
      await assertRejects(() =>
        verifyAppleIdentityToken(
          idTokenString,
          options,
          async () => rsa.publicKey,
        ),
      );
    }
    const attacker = await generateKeyPair('RS256');
    const awaitableToken = await idToken({}, attacker.privateKey);
    await assertRejects(() =>
      verifyAppleIdentityToken(
        awaitableToken,
        options,
        async () => rsa.publicKey,
      ),
    );
  },
);

Deno.test(
  'Apple refresh credential encryption rejects tampering and cross-user substitution',
  async () => {
    const encrypted = await encryptAppleRefreshToken(
      'refresh-secret',
      encryptionKey,
      context,
    );
    assertEquals(
      await decryptAppleRefreshToken(encrypted, encryptionKey, context),
      'refresh-secret',
    );
    assertNotEquals(
      encrypted,
      await encryptAppleRefreshToken('refresh-secret', encryptionKey, context),
    );
    await assertRejects(() =>
      decryptAppleRefreshToken(encrypted, encryptionKey, {
        ...context,
        userId: 'other',
      }),
    );
    const parts = encrypted.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    await assertRejects(() =>
      decryptAppleRefreshToken(parts.join('.'), encryptionKey, context),
    );
  },
);

function memoryStore() {
  let credential: AppleCredential | null = null;
  const store: AppleCredentialStore = {
    hasStoredCode: async (userId, codeHash) =>
      credential?.userId === userId && credential?.codeHash === codeHash,
    storeCredential: async (value) => {
      credential = value;
      return 'stored';
    },
  };
  return { store, read: () => credential };
}

Deno.test(
  'retention encrypts a verified credential and replay never consumes the code twice',
  async () => {
    const memory = memoryStore();
    const token = await idToken();
    let exchanges = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      exchanges++;
      const body = new URLSearchParams(String(init?.body));
      assertEquals(body.get('code'), 'one-time-code');
      assertEquals(body.get('client_id'), clientId);
      return Response.json({
        id_token: token,
        refresh_token: 'refresh-secret',
      });
    };
    const deps = {
      config,
      store: memory.store,
      fetchImpl,
      verificationKey: async () => rsa.publicKey,
    };
    const input = { authorizationCode: 'one-time-code', nonce: rawNonce, user };
    assertEquals(await retainAppleAuthorization(input, deps), 'stored');
    assertEquals(await retainAppleAuthorization(input, deps), 'already_stored');
    assertEquals(exchanges, 1);
    assertEquals(
      await decryptAppleRefreshToken(
        memory.read()!.encryptedRefreshToken,
        encryptionKey,
        context,
      ),
      'refresh-secret',
    );
  },
);

Deno.test(
  'consumed code and foreign Apple subject cannot overwrite a good credential',
  async () => {
    const memory = memoryStore();
    const original: AppleCredential = {
      ...context,
      codeHash: 'original',
      encryptedRefreshToken: 'original-ciphertext',
    };
    await memory.store.storeCredential(original);
    const input = { authorizationCode: 'consumed-code', nonce: rawNonce, user };
    await assertRejects(() =>
      retainAppleAuthorization(input, {
        config,
        store: memory.store,
        verificationKey: async () => rsa.publicKey,
        fetchImpl: async () =>
          Response.json(
            { error: 'invalid_grant', secret: 'must-not-leak' },
            { status: 400 },
          ),
      }),
    );
    assertEquals(memory.read(), original);
    const foreign = await idToken({ sub: 'other-user' });
    await assertRejects(() =>
      retainAppleAuthorization(input, {
        config,
        store: memory.store,
        verificationKey: async () => rsa.publicKey,
        fetchImpl: async () =>
          Response.json({
            id_token: foreign,
            refresh_token: 'foreign-refresh',
          }),
      }),
    );
    assertEquals(memory.read(), original);
  },
);
