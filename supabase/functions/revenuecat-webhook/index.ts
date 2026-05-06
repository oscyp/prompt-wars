// RevenueCat Webhook Handler
// Mirrors purchase and subscription events into Supabase
// Validates webhook signatures and enforces idempotency

import { createServiceClient, corsHeaders, errorResponse, successResponse, generateIdempotencyKey } from '../_shared/utils.ts';

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
    store: string; // app_store | play_store | stripe
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
    
    if (webhookSecret) {
      // Validate HMAC-SHA256 signature
      const signature = req.headers.get('X-RevenueCat-Signature');
      
      if (!signature) {
        console.error('Missing webhook signature');
        return errorResponse('Unauthorized', 401);
      }
      
      const body = await req.text();
      const isValid = await validateWebhookSignature(body, signature, webhookSecret);
      
      if (!isValid) {
        console.error('Invalid webhook signature');
        return errorResponse('Unauthorized', 401);
      }
      
      // Re-parse after signature check
      const webhookData: RevenueCatEvent = JSON.parse(body);
      return await processWebhookEvent(webhookData);
    } else {
      console.warn('REVENUECAT_WEBHOOK_SECRET not set, skipping signature validation');
      const webhookData: RevenueCatEvent = await req.json();
      return await processWebhookEvent(webhookData);
    }
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500);
  }
});

/**
 * Validate RevenueCat webhook signature (HMAC-SHA256)
 */
async function validateWebhookSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureBuffer = Uint8Array.from(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const dataBuffer = encoder.encode(body);
    
    return await crypto.subtle.verify('HMAC', key, signatureBuffer, dataBuffer);
  } catch (err) {
    console.error('Signature validation error:', err);
    return false;
  }
}

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
  
  // Idempotency: check if this event was already processed
  const eventIdempotencyKey = generateIdempotencyKey(['revenuecat_event', event.id]);
  const { data: existingEvent } = await supabase
    .from('wallet_transactions')
    .select('id')
    .eq('idempotency_key', eventIdempotencyKey)
    .maybeSingle();
  
  if (existingEvent) {
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
    console.error('Profile not found for webhook:', profileId);
    return errorResponse('Profile not found', 404);
  }
  
  // Handle subscription events
  if (event.type === 'INITIAL_PURCHASE' && event.product_id.includes('plus')) {
    return await handleSubscriptionActivation(supabase, event);
  }
  
  if (event.type === 'RENEWAL' && event.product_id.includes('plus')) {
    return await handleSubscriptionRenewal(supabase, event);
  }
  
  if (event.type === 'CANCELLATION' || event.type === 'EXPIRATION') {
    return await handleSubscriptionCancellation(supabase, event);
  }
  
  // Handle credit pack purchases
  if (event.type === 'INITIAL_PURCHASE' && event.product_id.startsWith('credits_')) {
    return await handleCreditPackPurchase(supabase, event);
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
  const platform = event.store === 'app_store' ? 'ios' 
    : event.store === 'play_store' ? 'android'
    : event.store === 'stripe' ? 'web'
    : 'unknown';
  
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
 * Handle subscription cancellation/expiration
 */
async function handleSubscriptionCancellation(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event']
): Promise<Response> {
  const { error: subError } = await supabase
    .from('subscriptions')
    .update({
      status: event.type === 'CANCELLATION' ? 'canceled' : 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('revenuecat_subscription_id', event.transaction_id);
  
  if (subError) {
    console.error('Subscription cancellation error:', subError);
    return errorResponse('Failed to process cancellation', 500);
  }
  
  return successResponse({ processed: true, type: event.type.toLowerCase() });
}

/**
 * Handle credit pack purchase (credits_10, credits_30, credits_80, credits_200)
 */
async function handleCreditPackPurchase(
  supabase: ReturnType<typeof createServiceClient>,
  event: RevenueCatEvent['event']
): Promise<Response> {
  // Parse credit amount from product_id using proper regex
  const match = event.product_id.match(/credits_(\d+)/);
  if (!match) {
    console.error('Invalid credit pack product_id:', event.product_id);
    return errorResponse('Invalid product_id', 400);
  }
  
  const creditAmount = parseInt(match[1], 10);
  
  // Map RevenueCat store to platform
  const platform = event.store === 'app_store' ? 'ios' 
    : event.store === 'play_store' ? 'android'
    : event.store === 'stripe' ? 'web'
    : 'unknown';
  
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
