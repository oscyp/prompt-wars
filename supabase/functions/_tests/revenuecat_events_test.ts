// Unit tests for RevenueCat subscription lifecycle → subscriptions-row mapping.
// Pure (no live stack): guards the CANCELLATION-keeps-benefits-until-expiry fix.
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  buildSubscriptionLifecycleUpdate,
  isSubscriptionLifecycleEvent,
  isOneOffPurchaseEvent,
  platformForStore,
} from '../_shared/revenuecat-events.ts';

const NOW_ISO = '2026-07-31T12:00:00.000Z';
const EXP_MS = Date.parse('2026-08-15T00:00:00.000Z');

Deno.test(
  'isSubscriptionLifecycleEvent: recognizes lifecycle events only',
  () => {
    assertEquals(isSubscriptionLifecycleEvent('CANCELLATION'), true);
    assertEquals(isSubscriptionLifecycleEvent('UNCANCELLATION'), true);
    assertEquals(isSubscriptionLifecycleEvent('EXPIRATION'), true);
    assertEquals(isSubscriptionLifecycleEvent('INITIAL_PURCHASE'), false);
    assertEquals(isSubscriptionLifecycleEvent('RENEWAL'), false);
  },
);

Deno.test(
  'CANCELLATION marks canceled but preserves expires_at when provided',
  () => {
    const update = buildSubscriptionLifecycleUpdate(
      'CANCELLATION',
      EXP_MS,
      NOW_ISO,
    );
    assertEquals(update.status, 'canceled');
    assertEquals(update.expires_at, new Date(EXP_MS).toISOString());
    assertEquals(update.updated_at, NOW_ISO);
  },
);

Deno.test(
  'CANCELLATION without expiration_at_ms does NOT clear expires_at (column omitted)',
  () => {
    const update = buildSubscriptionLifecycleUpdate(
      'CANCELLATION',
      undefined,
      NOW_ISO,
    );
    assertEquals(update.status, 'canceled');
    assertEquals('expires_at' in update, false);
  },
);

Deno.test('UNCANCELLATION returns the row to active', () => {
  const update = buildSubscriptionLifecycleUpdate(
    'UNCANCELLATION',
    EXP_MS,
    NOW_ISO,
  );
  assertEquals(update.status, 'active');
  assertEquals(update.expires_at, new Date(EXP_MS).toISOString());
});

Deno.test('EXPIRATION is terminal (expired)', () => {
  const update = buildSubscriptionLifecycleUpdate(
    'EXPIRATION',
    EXP_MS,
    NOW_ISO,
  );
  assertEquals(update.status, 'expired');
});

// Regression: credit packs bought on 2026-08-26 were acknowledged with 200 and
// silently granted nothing, because consumables arrive as NON_RENEWING_PURCHASE
// and the webhook only routed one-off products on INITIAL_PURCHASE.
Deno.test('isOneOffPurchaseEvent: NON_RENEWING_PURCHASE is a purchase', () => {
  assertEquals(isOneOffPurchaseEvent('NON_RENEWING_PURCHASE'), true);
  assertEquals(isOneOffPurchaseEvent('INITIAL_PURCHASE'), true);
  assertEquals(isOneOffPurchaseEvent('RENEWAL'), false);
  assertEquals(isOneOffPurchaseEvent('CANCELLATION'), false);
  assertEquals(isOneOffPurchaseEvent('EXPIRATION'), false);
});

// Regression: RevenueCat sends `store` uppercase, so the old lowercase
// comparisons never matched and EVERY purchase recorded platform='unknown'.
Deno.test('platformForStore: maps RevenueCat uppercase store values', () => {
  assertEquals(platformForStore('APP_STORE'), 'ios');
  assertEquals(platformForStore('MAC_APP_STORE'), 'ios');
  assertEquals(platformForStore('PLAY_STORE'), 'android');
  assertEquals(platformForStore('STRIPE'), 'web');
  assertEquals(platformForStore('TEST_STORE'), 'test');
});

Deno.test(
  'platformForStore: case-insensitive and safe on missing values',
  () => {
    assertEquals(platformForStore('app_store'), 'ios');
    assertEquals(platformForStore(undefined), 'unknown');
    assertEquals(platformForStore(''), 'unknown');
    assertEquals(platformForStore('SOME_NEW_STORE'), 'unknown');
  },
);
