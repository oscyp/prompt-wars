// RevenueCat Webhook Handler
// Mirrors purchase and subscription events into Supabase
// Validates webhook signatures and enforces idempotency

import {
  createServiceClient,
  corsHeaders,
  errorResponse,
  successResponse,
} from '../_shared/utils.ts';
import { validateWebhookSignature } from './verify-signature.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

    // Fail closed: verify_jwt is disabled for this endpoint (config.toml), so
    // the HMAC signature is the ONLY authentication. Accepting unsigned events
    // would let anyone mint subscriptions/credits by posting fake purchases.
    if (!webhookSecret) {
      console.error('REVENUECAT_WEBHOOK_SECRET not set — rejecting webhook');
      return errorResponse('Webhook secret not configured', 503);
    }

    // Validate the HMAC-SHA256 signature.
    //
    // Header name and format both matter and both were previously wrong:
    // RevenueCat sends `X-RevenueCat-Webhook-Signature`, not
    // `X-RevenueCat-Signature`, and its value is
    //
    //     t=<unix_timestamp>,v1=<hmac_sha256_hex>
    //
    // not a bare hex digest. The HMAC is computed over `<timestamp>.<raw_body>`,
    // not over the body alone. With any of those three wrong, every genuine
    // delivery is rejected -- so the endpoint would have 401'd real traffic
    // even once the secret was configured.
    const signature = req.headers.get('X-RevenueCat-Webhook-Signature');

    if (!signature) {
      console.error('Missing webhook signature');
      return errorResponse('Unauthorized', 401);
    }

    // Raw body, read once and never re-serialized: HMAC is over the exact bytes
    // received, so a JSON.parse -> JSON.stringify round-trip breaks valid
    // requests.
    const body = await req.text();
    const isValid = await validateWebhookSignature(
      body,
      signature,
      webhookSecret,
    );

    if (!isValid) {
      console.error('Invalid webhook signature');
      return errorResponse('Unauthorized', 401);
    }

    // Re-parse after signature check
    const webhookData = JSON.parse(body);
    if (!webhookData?.event || typeof webhookData.event !== 'object') {
      return errorResponse('Invalid webhook payload', 400);
    }

    // The database owns the complete transaction, including its event claim.
    // A failure rolls the claim back so RevenueCat's next delivery can retry.
    const { data, error } = await createServiceClient().rpc(
      'process_revenuecat_event',
      { p_event: webhookData.event },
    );
    if (error) {
      console.error('RevenueCat fulfillment failed:', error);
      return errorResponse('Failed to fulfill RevenueCat event', 500);
    }
    return successResponse(data);
  } catch (error) {
    console.error('Webhook processing error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal error',
      500,
    );
  }
});
