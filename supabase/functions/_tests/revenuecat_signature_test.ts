// RevenueCat webhook signature verification.
//
// The original implementation read `X-RevenueCat-Signature` (RevenueCat sends
// `X-RevenueCat-Webhook-Signature`), treated the value as a bare hex digest
// (it is `t=<unix_ts>,v1=<hex>`), and HMAC'd the body alone (the signed payload
// is `<timestamp>.<body>`). All three had to be wrong together for the endpoint
// to look plausible while rejecting every genuine delivery with 401.
//
// These tests sign payloads exactly the way RevenueCat documents, so a
// regression on any of the three shows up here rather than in production.

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { validateWebhookSignature } from '../revenuecat-webhook/verify-signature.ts';

const SECRET = 'test-signing-secret';
const BODY = JSON.stringify({ event: { id: 'evt_1', type: 'RENEWAL' } });

async function signAs(ts: string, body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const nowTs = () => Math.floor(Date.now() / 1000).toString();

Deno.test('accepts a correctly signed RevenueCat delivery', async () => {
  const t = nowTs();
  const header = `t=${t},v1=${await signAs(t, BODY, SECRET)}`;
  assertEquals(await validateWebhookSignature(BODY, header, SECRET), true);
});

Deno.test('rejects a signature made with the wrong secret', async () => {
  const t = nowTs();
  const header = `t=${t},v1=${await signAs(t, BODY, 'wrong-secret')}`;
  assertEquals(await validateWebhookSignature(BODY, header, SECRET), false);
});

Deno.test('rejects a tampered body', async () => {
  const t = nowTs();
  const header = `t=${t},v1=${await signAs(t, BODY, SECRET)}`;
  const tampered = JSON.stringify({ event: { id: 'evt_1', type: 'INITIAL_PURCHASE' } });
  assertEquals(await validateWebhookSignature(tampered, header, SECRET), false);
});

Deno.test('rejects a stale timestamp even when correctly signed', async () => {
  // Bounds the replay window. RENEWAL resets allowance counters, so an
  // indefinitely-valid signed body is worth more to an attacker than it looks.
  const t = Math.floor(Date.now() / 1000 - 3600).toString();
  const header = `t=${t},v1=${await signAs(t, BODY, SECRET)}`;
  assertEquals(await validateWebhookSignature(BODY, header, SECRET), false);
});

Deno.test('rejects the old bare-hex header format', async () => {
  // What the previous implementation expected. Accepting it would mean the
  // timestamp is unverified.
  const t = nowTs();
  const bare = await signAs(t, BODY, SECRET);
  assertEquals(await validateWebhookSignature(BODY, bare, SECRET), false);
});

Deno.test('rejects malformed headers without throwing', async () => {
  for (const header of ['', 't=,v1=', 'v1=abc', 't=notanumber,v1=abcd', 't=1,v1=zzzz', 't=1,v1=abc']) {
    assertEquals(await validateWebhookSignature(BODY, header, SECRET), false, header);
  }
});
