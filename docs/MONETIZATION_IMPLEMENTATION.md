# Prompt Wars Monetization Implementation

## Overview

This document describes the implemented monetization infrastructure for Prompt Wars, covering credit economy, subscription model, purchase flow, and server-side validation.

## Architecture

### Server-Side (Single Source of Truth)

- **Entitlements View** (`entitlements`): Derived view that aggregates subscription status, credit balance, and allowances. All feature gates query this view.
- **Wallet Ledger** (`wallet_transactions`): Immutable transaction log with idempotency keys for grants, spends, and refunds.
- **RevenueCat Webhook** (`revenuecat-webhook`): Validates webhook signatures, mirrors purchases/subscriptions to Supabase, grants credits with idempotency.
- **Video Upgrade** (`request-video-upgrade`): Server-owned decision flow that checks entitlements, spends credits/allowance/grants, and creates video jobs.

### Client-Side (Read-Only State)

- **RevenueCatProvider**: React context that wraps RevenueCat SDK, fetches offerings, and initiates purchases.
- **Monetization Utils** (`utils/monetization.ts`): Typed helpers for calling Edge Functions and querying entitlements view.
- **Wallet Screen** (`app/(profile)/wallet.tsx`): UI for balance, credit packs, subscription, and transaction history.

## Credit Economy

### Credit Packs (Consumable)

| Pack     | Credits | USD   | Product ID      |
|----------|---------|-------|-----------------|
| Starter  | 10      | 1.99  | `credits_10`    |
| Standard | 30      | 4.99  | `credits_30`    |
| Big      | 80      | 9.99  | `credits_80`    |
| Whale    | 200     | 19.99 | `credits_200`   |

One credit = one Tier 1 video reveal.

### Free-to-Play Credit Spine

Per `docs/prompt-wars-implementation-concept.md`, engaged free players can earn credits through:

- **Daily login streak** with escalating rewards and mercy day
- **Daily quests** (3 tasks/day)
- **Win-streak milestones**
- **Season placement rewards**
- **Judge-a-friend minigame** (capped daily)

Server function `grant-credits` handles all credit grants with idempotency.

### Onboarding Free Grant

New accounts receive **3 free Tier 1 video reveals in the first 7 days** to experience the hero feature before paywall pressure. Tracked server-side in `request-video-upgrade` via `checkFreeGrantsRemaining()`.

## Subscription Model

### Prompt Wars+ (Single Tier)

**Price**: $9.99/month or $59.99/year

**Product IDs**:
- `promptwars_plus_monthly`
- `promptwars_plus_annual`

**Benefits**:
- 30 video reveals per month (monthly allowance)
- Exclusive subscriber badge
- Priority generation queue
- Full video history retention
- Expanded prompt draft slots
- Cosmetic unlocks

**No Pay-to-Win**: Subscription never grants ranked stat boosts, paid archetypes, or scoring modifiers.

## Purchase Flow

### 1. Client Initiates Purchase

```typescript
import { useRevenueCat } from '@/providers/RevenueCatProvider';

const { offerings, purchasePackage } = useRevenueCat();

// Get package from offerings
const pkg = offerings.current?.availablePackages.find(
  p => p.product.identifier === 'credits_30'
);

// Initiate purchase
const success = await purchasePackage(pkg);
```

### 2. RevenueCat Processes Payment

RevenueCat handles App Store / Play Store payment flow and receipt validation.

### 3. Webhook to Server

RevenueCat sends webhook event to `revenuecat-webhook` Edge Function:

```typescript
{
  event: {
    type: 'INITIAL_PURCHASE',
    app_user_id: '<supabase_user_id>',
    product_id: 'credits_30',
    transaction_id: 'unique_transaction_id',
    price_in_purchased_currency: 4.99,
    currency: 'USD',
    store: 'app_store'
  }
}
```

### 4. Server Validates and Grants

`revenuecat-webhook`:
- Validates webhook signature (HMAC-SHA256)
- Checks idempotency (`revenuecat_event_<event.id>`)
- Validates profile exists
- Inserts into `purchases` table
- Calls `grant_credits` RPC with idempotency
- For subscriptions, upserts into `subscriptions` table

### 5. Client Queries Entitlements

```typescript
import { getWalletBalance } from '@/utils/monetization';

const balance = await getWalletBalance();
// { credits_balance: 30, is_subscriber: false, ... }
```

## Video Upgrade Flow

### 1. Request Video Upgrade (Preview Cost)

```typescript
import { requestVideoUpgrade } from '@/utils/monetization';

// Get cost preview
const result = await requestVideoUpgrade('battle_id', false);
/*
{
  can_upgrade: true,
  entitlement_check: {
    method: 'credits',
    cost_credits: 1,
    credits_balance: 30
  },
  message: 'Video upgrade available. Call again with auto_spend=true to proceed.'
}
*/
```

### 2. Confirm and Spend

```typescript
// Proceed with upgrade
const result = await requestVideoUpgrade('battle_id', true);
/*
{
  success: true,
  video_job_id: '<job_id>',
  status: 'queued',
  entitlement_source: 'credits'
}
*/
```

### 3. Server Decision Flow

`request-video-upgrade` Edge Function:

1. Validates user is battle participant
2. Validates battle is `result_ready` or `completed`
3. Checks for existing video job (idempotency)
4. Queries `entitlements` view
5. Determines method: `free_grant` → `subscription_allowance` → `credits` → `none`
6. If `auto_spend=true`, spends via appropriate method
7. Creates `video_jobs` row with payload hash
8. Returns job ID and entitlement source

### 4. Priority Order

1. **Free Grant** (first 7 days, 3 reveals)
2. **Subscription Allowance** (30/month for Prompt Wars+)
3. **Credits** (consumable balance)

## Idempotency

All critical operations use idempotency keys to prevent double-processing:

- **Webhook events**: `revenuecat_event_<event.id>`
- **Purchases**: `purchase_<transaction_id>`
- **Video upgrades**: `video_upgrade_<user_id>_<battle_id>`
- **Free grants**: `free_tier1_grant_<user_id>_<battle_id>`
- **Daily login**: `daily_login_<user_id>_<date>`

Server functions check for existing transactions with the same idempotency key before processing.

## Refund Handling

### Automatic Refunds

- **Provider failure**: Video generation timeout or error triggers automatic refund via `refund_credits()` RPC
- **Moderation rejection**: Post-gen unsafe content refunds credits
- **Pre-gen moderation**: Prompt rejected before video job creation, no charge

### Manual Refunds

Support team can call `grant_credits` with reason `refund` and negative original transaction as metadata.

## Security

### Server-Side Only

- RevenueCat webhook secret (`REVENUECAT_WEBHOOK_SECRET`)
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`)
- Provider API keys (xAI, judge, moderation)

### Client-Side Public

- RevenueCat public SDK keys (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`)
- Supabase anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`)

### Validation

- Webhook signature validation (HMAC-SHA256)
- JWT user authentication on all Edge Functions
- RLS policies on all tables
- Battle participant validation before video upgrade
- Never trust client-side purchase state for gameplay decisions

## Database Schema

### Entitlements View (Read-Only)

```sql
CREATE OR REPLACE VIEW entitlements AS
SELECT 
  p.id AS profile_id,
  COALESCE(s.status = 'active', FALSE) AS is_subscriber,
  s.tier AS subscription_tier,
  COALESCE(s.monthly_video_allowance - s.monthly_video_allowance_used, 0) AS monthly_video_allowance_remaining,
  COALESCE(
    (SELECT SUM(amount) FROM wallet_transactions wt 
     WHERE wt.profile_id = p.id AND wt.currency_type = 'credits'),
    0
  ) AS credits_balance,
  ...
FROM profiles p
LEFT JOIN subscriptions s ON s.profile_id = p.id AND s.status = 'active';
```

### Wallet Transactions (Ledger)

```sql
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id),
  amount INTEGER, -- positive = credit, negative = debit
  balance_after INTEGER,
  currency_type currency_type DEFAULT 'credits',
  reason TEXT, -- purchase, video_upgrade, refund, daily_login, etc.
  battle_id UUID,
  purchase_id UUID,
  video_job_id UUID,
  metadata JSONB,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Testing

### Unit Tests

Run backend tests:

```bash
cd supabase/functions
deno test --allow-all
```

### Manual Testing

1. **Credit Pack Purchase**:
   - Use RevenueCat sandbox environment
   - Purchase `credits_30` pack
   - Verify webhook receives event
   - Verify credits appear in `entitlements` view
   - Verify transaction in `wallet_transactions`

2. **Subscription**:
   - Purchase `promptwars_plus_monthly`
   - Verify subscription row created with `status='active'`
   - Verify `entitlements.is_subscriber = true`
   - Verify `monthly_video_allowance_remaining = 30`

3. **Video Upgrade**:
   - Complete a battle to `result_ready`
   - Call `request-video-upgrade` with `auto_spend=false` (cost preview)
   - Call with `auto_spend=true` (confirm)
   - Verify `video_jobs` row created
   - Verify credits deducted or allowance decremented
   - Verify free grant logic for new accounts

4. **Refund**:
   - Trigger video generation failure
   - Verify `refund_credits()` called
   - Verify positive transaction in ledger

## Integration Notes for Mobile/QA

### Environment Setup

1. Configure RevenueCat dashboard with product IDs:
   - `credits_10`, `credits_30`, `credits_80`, `credits_200`
   - `promptwars_plus_monthly`, `promptwars_plus_annual`

2. Set up webhook in RevenueCat dashboard:
   - URL: `https://your-project.supabase.co/functions/v1/revenuecat-webhook`
   - Add `REVENUECAT_WEBHOOK_SECRET` to Supabase Edge Function secrets

3. Add RevenueCat keys to `.env`:
   ```bash
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
   ```

### Provider Initialization

Wrap app in `RevenueCatProvider` in `app/_layout.tsx`:

```tsx
import { RevenueCatProvider } from '@/providers/RevenueCatProvider';

export default function RootLayout() {
  return (
    <RevenueCatProvider>
      {/* rest of app */}
    </RevenueCatProvider>
  );
}
```

### Wallet Screen

Navigate to `/profile/wallet` to view:
- Current credit balance
- Subscription status
- Purchase buttons for credit packs
- Subscription upgrade
- Transaction history
- Restore purchases button

## Known Assumptions/Stubs

1. **First-Time-User Offer (FTUO)**: Logic stubbed in spec; requires UI flow and anti-abuse signal integration.
2. **Battle Pass**: Deferred to Phase 4+.
3. **Cosmetic Shop**: Deferred to Phase 4+.
4. **Rewarded Ads**: Not implemented in MVP.
5. **Cross-Platform Restore**: RevenueCat handles this; tested on sandbox only.

## Metrics & Analytics

Required event instrumentation (to be added by mobile executor):

- `iap_paywall_view` (wallet screen opened)
- `iap_purchase_started` (pack or sub selected)
- `iap_purchase_succeeded` (RevenueCat confirmation)
- `iap_purchase_failed` (error or cancellation)
- `video_upgrade_requested` (auto_spend=false)
- `video_upgrade_confirmed` (auto_spend=true)
- `subscription_started`, `subscription_renewed`, `subscription_cancelled`

## Support & Debugging

### Check Entitlements

```sql
SELECT * FROM entitlements WHERE profile_id = '<user_id>';
```

### Check Wallet Ledger

```sql
SELECT * FROM wallet_transactions 
WHERE profile_id = '<user_id>' 
ORDER BY created_at DESC;
```

### Check Video Jobs

```sql
SELECT * FROM video_jobs 
WHERE battle_id = '<battle_id>';
```

### Replay Webhook

Use RevenueCat dashboard to resend webhook events for testing.

---

**Author**: Monetization Executor  
**Date**: 2026-05-06  
**Version**: 1.0  
**Status**: MVP Implementation Complete
