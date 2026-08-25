// Signature verification for RevenueCat webhooks.
//
// Extracted from index.ts so it can be unit-tested without invoking
// Deno.serve, mirroring sign-battle-portraits/resolve-battle-portraits.ts.

/** Max age of a signed webhook, in seconds. Bounds the replay window. */
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Validate a RevenueCat webhook signature.
 *
 * Header value is `t=<unix_timestamp>,v1=<hmac_sha256_hex>` and the HMAC covers
 * `<timestamp>.<raw_body>`.
 *
 * The timestamp is also checked against a tolerance window. Without it a
 * correctly-signed body stays valid forever and can be replayed indefinitely --
 * which matters here because the RENEWAL handler resets subscription allowance
 * counters. The event-id claim in claim_revenuecat_event() is the durable
 * defence; this narrows the window an attacker has to work in at all.
 */
export async function validateWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = new Map(
      signature
        .split(',')
        .map((piece) => piece.trim().split('='))
        .filter((kv): kv is [string, string] => kv.length === 2)
        .map(([k, v]) => [k.trim(), v.trim()] as [string, string]),
    );

    const timestamp = parts.get('t');
    const providedHex = parts.get('v1');

    if (!timestamp || !providedHex) {
      console.error('Malformed webhook signature header');
      return false;
    }

    if (!/^[0-9a-f]+$/i.test(providedHex) || providedHex.length % 2 !== 0) {
      console.error('Webhook signature is not valid hex');
      return false;
    }

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt)) {
      console.error('Webhook timestamp is not numeric');
      return false;
    }
    const ageSeconds = Math.abs(Date.now() / 1000 - sentAt);
    if (ageSeconds > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
      console.error(`Webhook timestamp outside tolerance (${Math.round(ageSeconds)}s)`);
      return false;
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBuffer = Uint8Array.from(
      providedHex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
    );
    // Signed payload is timestamp + '.' + raw body.
    const dataBuffer = encoder.encode(`${timestamp}.${body}`);

    // crypto.subtle.verify is constant-time.
    return await crypto.subtle.verify('HMAC', key, signatureBuffer, dataBuffer);
  } catch (err) {
    console.error('Signature validation error:', err);
    return false;
  }
}
