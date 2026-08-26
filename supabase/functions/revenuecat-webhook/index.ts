// RevenueCat Webhook Handler
// Mirrors purchase and subscription events into Supabase
// Validates webhook signatures and enforces idempotency

import { createServiceClient, corsHeaders, errorResponse, successResponse, generateIdempotencyKey } from '../_shared/utils.ts';
import { buildSubscriptionLifecycleUpdate, isSubscriptionLifecycleEvent, creditsForProductId, platformForStore, isOneOffPurchaseEvent } from '../_shared/revenuecat-events.ts';
import { validateWebhookSignature } from './verify-signature.ts';

interface RevenueCatEvent {
  api_version: string;
  event: {
    type: string; // INITIAL_PURCHASE, RENEWAL, CANCELLATION, etc.
    id: string; // Event ID for idempotency
    app_user_id: string;
    product_id: string;
    price_in_purchased_currency: number;
    currency: string;
    transaction_id: string;
    expiration_at_ms?: number;
    period_type?: string;
    store: string; // UPPERCASE: APP_STORE | PLAY_STORE | STRIPE | TEST_STORE | ...
  };
}

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
    const isValid = await validateWebhookSignature(body, signature, webhookSecret);

    if (!isValid) {
      console.error('Invalid webhook signature');
      return errorResponse('Unauthorized', 401);
    }

    // Re-parse after signature check
    const webhookData: RevenueCatEvent = JSON.parse(body);
    return await processWebhookEvent(webhookData);

  } catch (error) {
    console.error('Webhook processing error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});


/**
 * Process webhook event with idempotency
 */
async function processWebhookEvent(webhookData: RevenueCatEvent): Promise<Response> {
  const { event } = webhookData;
  
  if (!event || !event.app_user_id) {
    return errorResponse('Invalid webhook payload');
  }
  
  const supabase = createServiceClient();
  const profileId = event.app_user_id; // RevenueCat app_user_id = Supabase user ID
  
  // Idempotency. The previous guard looked for a 'revenuecat_event_<id>' key in
  // wallet_transactions that nothing ever wrote, so it never matched -- leaving
  // RENEWAL, which resets monthly_*_allowance_used to 0 and has no idempotency
  // of its own, replayable with a single captured signed body. RevenueCat also
  // retries on non-2xx, so this could fire without an attacker.
  //
  // claim_revenuecat_event() is an atomic INSERT ... ON CONFLICT DO NOTHING, so
  // concurrent duplicate deliveries cannot both win. Claimed BEFORE any
  // mutation.
  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_revenuecat_event',
    {
      p_event_id: String(event.id ?? ''),
      p_event_type: String(event.type ?? 'unknown'),
      p_profile_id: profileId,
    },
  );

  if (claimError) {
    console.error('Failed to claim RevenueCat event:', claimError);
    // Fail closed. A 500 makes RevenueCat retry, which is safe now that the
    // claim is the thing preventing double-application.
    return errorResponse('Failed to record event', 500);
  }

  if (claimed === false) {
    console.log('Event already processed:', event.id);
    return successResponse({ processed: true, duplicate: true });
  }
  
  // Validate profile exists
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();
  
  if (profileError || !profile) {
    // Acknowledge rather than 404. RevenueCat retries on any non-2xx, and an
    // app_user_id that is not one of our profiles will never become one by
    // retrying -- so a 404 turns a test event, a deleted account or a
    // misconfigured app_user_id into an endless redelivery loop against a
    // permanently unsatisfiable condition.
    //
    // Nothing was mutated before this point (the event claim is a dedup record,
    // not a state change), so acknowledging is safe.
    console.warn(
      'RevenueCat event for unknown profile, acknowledging without processing:',
      profileId,
    );
    return successResponse({
      processed: false,
      action: 'ignored_unknown_profile',
      profile_id: profileId,
    });
  }
  
  // Handle subscription events
  if (event.type === 'INITIAL_PURCHASE' && event.product_id.includes('plus')) {
    return await handleSubscriptionActivation(supabase, event);
  }
  
  if (event.type === 'RENEWAL' && event.product_id.includes('plus')) {
    return await handleSubscriptionRenewal(supabase, event);
  }
  
  if (isSubscriptionLifecycleEvent(event.type)) {
    return await handleSubscriptionLifecycle(supabase, event, event.type);
  }
  
  // Handle credit pack purchases
  if (isOneOffPurchaseEvent(event.type) && event.product_id.startsWith('credits_')) {
    return await handleCreditPackPurchase(supabase, event);
  }
  
  // Handle first-time-user offer (FTUO) bundle purchase
  if (isOneOffPurchaseEvent(event.type) && event.product_id.startsWith('ftuo_')) {
    return await handleFirstTimeOfferPurchase(supabase, event);
  }
  
  // Unknown event type - acknowledge but don't process
  console.log('Unknown event type:', event.type);
  return successResponse({ processed: true, event_type: event.type, action: 'ignored' });
}

/**
 * Handle subscription activation (INITIAL_PURCHASE for plus)
 */
async function handleSubscriptionActivation(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event']
): Promise<Response> {
  const expiresAt = event.expiration_at_ms 
    ? new Date(event.expiration_at_ms).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Default 30 days
  
  // Map RevenueCat store to platform
  const platform = platformForStore(event.store);
  
  const { error: subError } = await supabase
    .from('subscriptions')
    .upsert({
      profile_id: event.app_user_id,
      revenuecat_subscription_id: event.transaction_id,
      product_id: event.product_id,
      status: 'active',
      tier: 'plus',
      monthly_video_allowance: 30,
      monthly_video_allowance_used: 0,
      monthly_round_allowance: 90,
      monthly_round_allowance_used: 0,
      monthly_full_battle_cap: 30,
      monthly_full_battle_cap_used: 0,
      allowance_reset_at: expiresAt,
      starts_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, {
      onConflict: 'revenuecat_subscription_id',
    });
  
  if (subError) {
    console.error('Subscription upsert error:', subError);
    return errorResponse('Failed to process subscription', 500);
  }
  
  // Create purchase record using upsert to handle duplicate webhooks
  const { error: purchaseError } = await supabase
    .from('purchases')
    .upsert({
      profile_id: event.app_user_id,
      revenuecat_transaction_id: event.transaction_id,
      product_id: event.product_id,
      amount_usd: event.price_in_purchased_currency,
      currency_code: event.currency,
      platform,
      credits_granted: 0,
      fulfilled_at: new Date().toISOString(),
    }, {
      onConflict: 'revenuecat_transaction_id',
      ignoreDuplicates: true,
    });
  
  if (purchaseError) {
    console.error('Purchase record error:', purchaseError);
  }
  
  return successResponse({ processed: true, type: 'subscription_activated' });
}

/**
 * Handle subscription renewal
 */
async function handleSubscriptionRenewal(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event']
): Promise<Response> {
  const expiresAt = event.expiration_at_ms 
    ? new Date(event.expiration_at_ms).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // Reset allowance on renewal
  const { error: subError } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      monthly_video_allowance_used: 0,
      monthly_round_allowance_used: 0,
      monthly_full_battle_cap_used: 0,
      allowance_reset_at: expiresAt,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('revenuecat_subscription_id', event.transaction_id);
  
  if (subError) {
    console.error('Subscription renewal error:', subError);
    return errorResponse('Failed to process renewal', 500);
  }
  
  return successResponse({ processed: true, type: 'subscription_renewed' });
}

/**
 * Handle subscription lifecycle events: CANCELLATION / UNCANCELLATION / EXPIRATION.
 *
 * CANCELLATION only turns auto-renew off — the user remains PAID until
 * expires_at, and the entitlement views grant benefits while
 * status IN ('active','canceled') AND expires_at > now(). The update built by
 * buildSubscriptionLifecycleUpdate therefore preserves the stored expires_at
 * (refreshing it only when RevenueCat supplies expiration_at_ms), and
 * EXPIRATION remains the terminal status that ends benefits.
 */
async function handleSubscriptionLifecycle(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event'],
  eventType: 'CANCELLATION' | 'UNCANCELLATION' | 'EXPIRATION'
): Promise<Response> {
  const { error: subError } = await supabase
    .from('subscriptions')
    .update(buildSubscriptionLifecycleUpdate(eventType, event.expiration_at_ms))
    .eq('revenuecat_subscription_id', event.transaction_id);

  if (subError) {
    console.error('Subscription lifecycle update error:', eventType, subError);
    return errorResponse('Failed to process ' + eventType.toLowerCase(), 500);
  }

  return successResponse({ processed: true, type: eventType.toLowerCase() });
}

/**
 * Handle credit pack purchase (credits_10, credits_30, credits_80, credits_200)
 */
async function handleCreditPackPurchase(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event']
): Promise<Response> {
  // Explicit map, not a regex over the product id. Deriving the payout from
  // digits in a store identifier means a renamed SKU silently changes what a
  // player receives, and `credits_9999` would have granted 9999.
  const creditAmount = creditsForProductId(event.product_id);
  if (creditAmount === null) {
    console.error('Unknown credit pack product_id:', event.product_id);
    return errorResponse('Invalid product_id', 400);
  }
  
  // Map RevenueCat store to platform
  const platform = platformForStore(event.store);
  
  // Check for existing purchase (duplicate webhook)
  const { data: existingPurchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('revenuecat_transaction_id', event.transaction_id)
    .maybeSingle();
  
  let purchaseId: string;
  
  if (existingPurchase) {
    console.log('Duplicate purchase webhook, idempotent grant:', event.transaction_id);
    purchaseId = existingPurchase.id;
  } else {
    // Create new purchase record
    const { data: newPurchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        profile_id: event.app_user_id,
        revenuecat_transaction_id: event.transaction_id,
        product_id: event.product_id,
        amount_usd: event.price_in_purchased_currency,
        currency_code: event.currency,
        platform,
        credits_granted: creditAmount,
        fulfilled_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    
    if (purchaseError || !newPurchase) {
      console.error('Purchase insert error:', purchaseError);
      return errorResponse('Failed to create purchase record', 500);
    }
    
    purchaseId = newPurchase.id;
  }
  
  // Grant credits using RPC with idempotency (handles duplicates gracefully)
  const creditIdempotencyKey = generateIdempotencyKey(['credits_grant', event.transaction_id]);
  
  const { error: grantError } = await supabase.rpc('grant_credits', {
    p_profile_id: event.app_user_id,
    p_amount: creditAmount,
    p_reason: 'purchase',
    p_idempotency_key: creditIdempotencyKey,
    p_purchase_id: purchaseId,
  });
  
  if (grantError) {
    console.error('Credit grant error:', grantError);
    return errorResponse('Failed to grant credits', 500);
  }
  
  return successResponse({ 
    processed: true, 
    type: 'credit_pack_purchased',
    credits_granted: creditAmount,
    duplicate: !!existingPurchase,
  });
}

/**
 * Handle first-time-user offer (FTUO) bundle purchase.
 * Credits + exclusive cosmetic are granted atomically by the DB function
 * fulfill_first_time_offer, which is idempotent on the purchase id.
 */
async function handleFirstTimeOfferPurchase(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event']
): Promise<Response> {
  const platform = platformForStore(event.store);

  // Find or create the purchase record (idempotent on transaction id).
  const { data: existingPurchase } = await supabase
    .from('purchases')
    .select('id')
    .eq('revenuecat_transaction_id', event.transaction_id)
    .maybeSingle();

  let purchaseId: string;

  if (existingPurchase) {
    purchaseId = existingPurchase.id;
  } else {
    const { data: newPurchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        profile_id: event.app_user_id,
        revenuecat_transaction_id: event.transaction_id,
        product_id: event.product_id,
        amount_usd: event.price_in_purchased_currency,
        currency_code: event.currency,
        platform,
        fulfilled_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (purchaseError || !newPurchase) {
      console.error('FTUO purchase insert error:', purchaseError);
      return errorResponse('Failed to create purchase record', 500);
    }
    purchaseId = newPurchase.id;
  }

  const { data, error: fulfillError } = await supabase.rpc(
    'fulfill_first_time_offer',
    { p_profile_id: event.app_user_id, p_purchase_id: purchaseId },
  );

  if (fulfillError) {
    console.error('FTUO fulfillment error:', fulfillError);
    return errorResponse('Failed to fulfill offer', 500);
  }

  return successResponse({ processed: true, type: 'ftuo_purchased', result: data });
}

