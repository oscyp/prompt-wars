import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createGuardianConsentProvider,
  GuardianConsentUnavailableError,
  verifyKwsParentVerificationWebhook,
} from '../_shared/guardian-consent.ts';

const NOW = Date.parse('2026-09-22T12:00:00Z');
const TIMESTAMP = '1790078400';
const SECRET = 'test-webhook-secret-only';
const ORGANIZATION_ID = '10000000-0000-4000-8000-000000000001';
const PRODUCT_ID = '20000000-0000-4000-8000-000000000002';
const REGISTRATION_ID = '30000000-0000-4000-8000-000000000003';
const options = {
  organizationId: ORGANIZATION_ID,
  productId: PRODUCT_ID,
  webhookSecrets: [SECRET],
  now: () => NOW,
};
const event = {
  name: 'parent-verified',
  time: '2026-09-22T12:00:00Z',
  orgId: ORGANIZATION_ID,
  productId: PRODUCT_ID,
  payload: {
    parentEmail: 'guardian@example.com',
    externalPayload: JSON.stringify({
      registrationId: REGISTRATION_ID,
      policyVersion: '2026-09-reviewed',
    }),
    status: { verified: true, transactionId: 'pv-transaction-1' },
  },
};

// This fixture implements the published KWS wire algorithm independently.
async function signature(body: string, timestamp = TIMESTAMP, secret = SECRET) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return `t=${timestamp},v1=${Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

Deno.test(
  'KWS consent stays unavailable until an actual Consent Management integration exists',
  async () => {
    const provider = createGuardianConsentProvider();
    assertEquals(provider.readiness(), {
      provider: 'kws',
      ready: false,
      reason: 'kws_consent_management_not_configured',
    });
    const unavailable = await assertRejects(
      () =>
        provider.startHostedConsent({
          registrationId: REGISTRATION_ID,
          guardianEmail: 'guardian@example.com',
          policyVersion: '2026-09-reviewed',
          countryCode: 'PL',
          language: 'pl',
        }),
      GuardianConsentUnavailableError,
    );
    assertEquals(unavailable.code, 'consent_unavailable');
    await assertRejects(
      () =>
        provider.checkConsent({
          registrationId: REGISTRATION_ID,
          providerReference: 'pv-transaction-1',
          policyVersion: '2026-09-reviewed',
        }),
      GuardianConsentUnavailableError,
    );
  },
);

Deno.test(
  'a genuine KWS parent verification proves adult status but never guardian consent',
  async () => {
    const rawBody = JSON.stringify(event);
    assertEquals(
      await verifyKwsParentVerificationWebhook(
        rawBody,
        await signature(rawBody),
        options,
      ),
      {
        provider: 'kws',
        kind: 'parent_verification',
        adultVerified: true,
        consentGranted: false,
        registrationId: REGISTRATION_ID,
        policyVersion: '2026-09-reviewed',
        guardianEmail: 'guardian@example.com',
        providerReference: 'pv-transaction-1',
        occurredAt: '2026-09-22T12:00:00Z',
        replayKey: `kws:parent-verified:${ORGANIZATION_ID}:${PRODUCT_ID}:pv-transaction-1`,
      },
    );
  },
);

Deno.test(
  'a valid body with a forged signature cannot produce verification evidence',
  async () => {
    const rawBody = JSON.stringify(event);
    assertEquals(
      await verifyKwsParentVerificationWebhook(
        rawBody,
        await signature(rawBody, TIMESTAMP, 'attacker-key'),
        options,
      ),
      null,
    );
    assertEquals(
      await verifyKwsParentVerificationWebhook(rawBody, null, options),
      null,
    );
  },
);

Deno.test(
  'verification authenticates the exact raw body before parsing',
  async () => {
    const rawBody = JSON.stringify(event, null, 2);
    const header = await signature(rawBody);
    assertEquals(
      (await verifyKwsParentVerificationWebhook(rawBody, header, options))
        ?.adultVerified,
      true,
    );
    assertEquals(
      await verifyKwsParentVerificationWebhook(
        JSON.stringify(event),
        header,
        options,
      ),
      null,
    );
    assertEquals(
      await verifyKwsParentVerificationWebhook(
        rawBody.replace('guardian@example.com', 'attacker@example.com'),
        header,
        options,
      ),
      null,
    );
  },
);

Deno.test(
  'KWS secret rotation accepts either published v1 signature',
  async () => {
    const rawBody = JSON.stringify(event);
    const previous = await signature(rawBody, TIMESTAMP, 'previous-key');
    const current = await signature(rawBody);
    const header = `${previous},${current.split(',')[1]}`;
    assertEquals(
      (await verifyKwsParentVerificationWebhook(rawBody, header, options))
        ?.adultVerified,
      true,
    );
    assertEquals(
      (
        await verifyKwsParentVerificationWebhook(rawBody, header, {
          ...options,
          webhookSecrets: ['previous-key'],
        })
      )?.adultVerified,
      true,
    );
    assertEquals(
      (
        await verifyKwsParentVerificationWebhook(rawBody, previous, {
          ...options,
          webhookSecrets: [SECRET, 'previous-key'],
        })
      )?.adultVerified,
      true,
    );
  },
);

Deno.test(
  'stale and future signed deliveries fail the local replay window',
  async () => {
    const rawBody = JSON.stringify(event);
    for (const timestamp of ['1790078099', '1790078431']) {
      assertEquals(
        await verifyKwsParentVerificationWebhook(
          rawBody,
          await signature(rawBody, timestamp),
          options,
        ),
        null,
      );
    }
    assertEquals(
      (
        await verifyKwsParentVerificationWebhook(
          rawBody,
          await signature(rawBody, '1790078100'),
          options,
        )
      )?.adultVerified,
      true,
    );
  },
);

Deno.test(
  'reissued webhook signatures retain the same durable deduplication key',
  async () => {
    const rawBody = JSON.stringify(event);
    const first = await verifyKwsParentVerificationWebhook(
      rawBody,
      await signature(rawBody),
      options,
    );
    const retry = await verifyKwsParentVerificationWebhook(
      rawBody,
      await signature(rawBody, '1790078401'),
      options,
    );
    assertEquals(
      first?.replayKey,
      `kws:parent-verified:${ORGANIZATION_ID}:${PRODUCT_ID}:pv-transaction-1`,
    );
    assertEquals(retry?.replayKey, first?.replayKey);
  },
);

Deno.test(
  'signed events for another organization or product are rejected',
  async () => {
    for (const changes of [
      { orgId: PRODUCT_ID },
      { productId: ORGANIZATION_ID },
      { productId: null },
    ]) {
      const rawBody = JSON.stringify({ ...event, ...changes });
      assertEquals(
        await verifyKwsParentVerificationWebhook(
          rawBody,
          await signature(rawBody),
          options,
        ),
        null,
      );
    }
    const rawBody = JSON.stringify({ ...event, productId: null });
    assertEquals(
      (
        await verifyKwsParentVerificationWebhook(
          rawBody,
          await signature(rawBody),
          { ...options, productId: null },
        )
      )?.adultVerified,
      true,
    );
  },
);

Deno.test('malformed or ambiguous signature headers fail closed', async () => {
  const rawBody = JSON.stringify(event);
  const valid = await signature(rawBody);
  for (const header of [
    '',
    'v1=abc',
    `t=${TIMESTAMP},v1=xyz`,
    `${valid},t=${TIMESTAMP}`,
    `t=Infinity,v1=${'0'.repeat(64)}`,
    `t=${TIMESTAMP},v1=${'0'.repeat(64)}`,
  ]) {
    assertEquals(
      await verifyKwsParentVerificationWebhook(rawBody, header, options),
      null,
      header,
    );
  }
  assertEquals(
    await verifyKwsParentVerificationWebhook(rawBody, valid, {
      ...options,
      webhookSecrets: [],
    }),
    null,
  );
  assertEquals(
    await verifyKwsParentVerificationWebhook(rawBody, valid, {
      ...options,
      webhookSecrets: [''],
    }),
    null,
  );
});

Deno.test(
  'signed but invalid event data cannot masquerade as parent verification',
  async () => {
    const invalid = [
      null,
      [],
      { ...event, name: 'consent-granted' },
      { ...event, time: 'yesterday' },
      {
        ...event,
        payload: {
          ...event.payload,
          status: { verified: false, transactionId: 'pv-1' },
        },
      },
      {
        ...event,
        payload: {
          ...event.payload,
          status: { verified: 'true', transactionId: 'pv-1' },
        },
      },
      { ...event, payload: { ...event.payload, status: { verified: true } } },
      { ...event, payload: { ...event.payload, parentEmail: 'bad-email' } },
      { ...event, payload: { ...event.payload, externalPayload: '{}' } },
      { ...event, payload: { ...event.payload, externalPayload: '{invalid' } },
      {
        ...event,
        payload: {
          ...event.payload,
          externalPayload: JSON.stringify({
            registrationId: 'not-a-registration',
            policyVersion: 'v1',
          }),
        },
      },
      {
        ...event,
        payload: {
          ...event.payload,
          externalPayload: JSON.stringify({
            registrationId: REGISTRATION_ID,
            policyVersion: '',
          }),
        },
      },
    ];
    for (const data of invalid) {
      const rawBody = JSON.stringify(data);
      assertEquals(
        await verifyKwsParentVerificationWebhook(
          rawBody,
          await signature(rawBody),
          options,
        ),
        null,
      );
    }
    assertEquals(
      await verifyKwsParentVerificationWebhook(
        '{broken',
        await signature('{broken'),
        options,
      ),
      null,
    );
  },
);

Deno.test(
  'provider payloads cannot inject purported consent evidence into the normalized result',
  async () => {
    const rawBody = JSON.stringify({
      ...event,
      consentGranted: true,
      payload: {
        ...event.payload,
        consent: 'approved',
        identityDocument: 'never-return-this',
      },
    });
    const normalized = await verifyKwsParentVerificationWebhook(
      rawBody,
      await signature(rawBody),
      options,
    );
    assertEquals(normalized?.consentGranted, false);
    assertEquals(
      JSON.stringify(normalized).includes('never-return-this'),
      false,
    );
    assertEquals(JSON.stringify(normalized).includes('approved'), false);
  },
);
