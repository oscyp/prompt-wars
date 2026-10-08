import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { generateKeyPair, SignJWT } from 'https://esm.sh/jose@6.1.3';
import { verifyRegistrationIdentity } from '../_shared/provider-identity.ts';
import { digestRegistrationSecret } from '../_shared/registration-policy.ts';

Deno.test(
  'provider permits require a signed identity, matching audience, expiry and hashed nonce',
  async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const nonce = 'a'.repeat(64);
    const hash = await digestRegistrationSecret(nonce);
    const sign = (claims: Record<string, unknown> = {}) =>
      new SignJWT({ nonce: hash, ...claims })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer('https://accounts.google.com')
        .setSubject('provider-subject')
        .setAudience('configured-client')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    const config = {
      googleAudiences: ['configured-client'],
      appleAudience: 'gg.promptwars.app',
    };
    const key = async () => publicKey;
    assertEquals(
      await verifyRegistrationIdentity(
        'google',
        await sign(),
        nonce,
        config,
        key,
      ),
      'provider-subject',
    );
    for (const [token, rawNonce, cfg] of [
      [await sign(), 'b'.repeat(64), config],
      [await sign({ nonce: undefined }), nonce, config],
      [await sign(), nonce, { ...config, googleAudiences: ['wrong-client'] }],
      ['unsigned.token.value', nonce, config],
    ] as const)
      await assertRejects(() =>
        verifyRegistrationIdentity('google', token, rawNonce, cfg, key),
      );
    const expired = await new SignJWT({ nonce: hash })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com')
      .setSubject('provider-subject')
      .setAudience('configured-client')
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(privateKey);
    await assertRejects(() =>
      verifyRegistrationIdentity('google', expired, nonce, config, key),
    );
    await assertRejects(() =>
      verifyRegistrationIdentity(
        'apple',
        awaitableString(),
        nonce,
        config,
        key,
      ),
    );
    function awaitableString() {
      return 'not-an-apple-token';
    }
  },
);

Deno.test(
  'signed provider identity requires a non-empty string subject',
  async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const nonce = 'a'.repeat(64);
    const hash = await digestRegistrationSecret(nonce);
    const config = {
      googleAudiences: ['configured-client'],
      appleAudience: '',
    };
    for (const sub of [123, {}, [], '', ' '.repeat(3)]) {
      const token = await new SignJWT({ nonce: hash, sub } as Record<
        string,
        unknown
      >)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer('https://accounts.google.com')
        .setAudience('configured-client')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      await assertRejects(() =>
        verifyRegistrationIdentity(
          'google',
          token,
          nonce,
          config,
          async () => publicKey,
        ),
      );
    }
  },
);
