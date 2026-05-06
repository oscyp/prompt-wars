import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/**
 * Initialize RevenueCat SDK
 * Call this once on app startup, after user authentication if needed
 * 
 * NOTE: Prefer using RevenueCatProvider instead of calling this directly.
 * This utility is kept for legacy/testing purposes.
 */
export const initializeRevenueCat = (userId?: string) => {
  const apiKey = Platform.select({
    ios: IOS_API_KEY,
    android: ANDROID_API_KEY,
  });

  if (!apiKey) {
    console.warn(
      'RevenueCat API key not found for this platform. In-app purchases will not work.',
    );
    return;
  }

  // Configure RevenueCat
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  Purchases.configure({
    apiKey,
    appUserID: userId, // Optional: set after authentication
  });

  console.log('RevenueCat initialized');
};

/**
 * Get current customer info (entitlements, subscriptions)
 */
export const getCustomerInfo = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('Error fetching customer info:', error);
    throw error;
  }
};

/**
 * Check if user has active subscription
 */
export const hasActiveSubscription = async (): Promise<boolean> => {
  try {
    const customerInfo = await getCustomerInfo();
    const entitlements = customerInfo.entitlements.active;
    return Object.keys(entitlements).length > 0;
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
};

/**
 * Restore purchases (for users who already purchased)
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
};

/**
 * Product IDs for credit packs and subscriptions
 * Match these with RevenueCat dashboard and .env.example documentation
 */
export const PRODUCT_IDS = {
  // Credit packs (consumable)
  CREDITS_10: 'credits_10',    // Starter: $1.99
  CREDITS_30: 'credits_30',    // Standard: $4.99 (best value)
  CREDITS_80: 'credits_80',    // Big: $9.99
  CREDITS_200: 'credits_200',  // Whale: $19.99

  // Subscription (Prompt Wars+)
  PLUS_MONTHLY: 'promptwars_plus_monthly',   // ~$9.99/mo
  PLUS_ANNUAL: 'promptwars_plus_annual',     // ~$59.99/yr
} as const;

/**
 * IMPORTANT: All purchase validation and entitlement grants MUST happen
 * server-side via Supabase Edge Functions. Never trust client-side
 * purchase state for gameplay decisions.
 * 
 * Purchase flow:
 * 1. Client initiates purchase via RevenueCat SDK
 * 2. RevenueCat processes payment with App Store / Play Store
 * 3. RevenueCat sends webhook to `revenuecat-webhook` Edge Function
 * 4. Server validates, mirrors purchase/subscription to DB, grants credits
 * 5. Client queries `entitlements` view to check feature gates
 * 
 * Video upgrade flow:
 * 1. Client calls `request-video-upgrade` Edge Function
 * 2. Server checks `entitlements` view (single source of truth)
 * 3. Server spends credits/allowance or grants from free tier
 * 4. Server creates `video_jobs` row
 * 5. Client subscribes to Realtime updates for video status
 */

