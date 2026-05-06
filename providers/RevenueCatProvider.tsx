// RevenueCat Provider / Hook
// Wraps RevenueCat SDK and coordinates with server-side validation

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import Purchases, {
  PurchasesOfferings,
  CustomerInfo,
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { supabase } from '@/utils/supabase';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

interface RevenueCatContextValue {
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;
  isSubscriber: boolean;
  isLoading: boolean;
  error: string | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshCustomerInfo: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextValue | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize RevenueCat on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const apiKey = Platform.select({
          ios: IOS_API_KEY,
          android: ANDROID_API_KEY,
        });

        if (!apiKey) {
          console.warn('RevenueCat API key not configured for this platform');
          if (mounted) setIsLoading(false);
          return;
        }

        // Get current user ID from Supabase
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          console.warn('No authenticated user for RevenueCat setup');
          if (mounted) setIsLoading(false);
          return;
        }

        // Configure RevenueCat
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        await Purchases.configure({
          apiKey,
          appUserID: user.id, // Supabase user ID
        });

        console.log('RevenueCat initialized with user:', user.id);

        // Fetch offerings and customer info
        await Promise.all([fetchOfferings(), fetchCustomerInfo()]);
      } catch (err) {
        console.error('RevenueCat initialization error:', err);
        if (mounted) setError(err instanceof Error ? err.message : 'Initialization failed');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  async function fetchOfferings() {
    try {
      const offerings = await Purchases.getOfferings();
      setOfferings(offerings);
      console.log('Offerings loaded:', offerings.current?.availablePackages.length);
    } catch (err) {
      console.error('Fetch offerings error:', err);
    }
  }

  async function fetchCustomerInfo() {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
      console.log('Customer info loaded. Active entitlements:', Object.keys(info.entitlements.active));
    } catch (err) {
      console.error('Fetch customer info error:', err);
    }
  }

  async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
    try {
      setError(null);
      console.log('Purchasing package:', pkg.identifier);

      const { customerInfo: newCustomerInfo } = await Purchases.purchasePackage(pkg);

      setCustomerInfo(newCustomerInfo);

      // Server-side validation happens via webhook
      // Client only updates local state; server owns entitlements
      console.log('Purchase completed. Server validation via webhook.');

      return true;
    } catch (err: any) {
      console.error('Purchase error:', err);

      // User cancelled
      if (err.userCancelled) {
        console.log('User cancelled purchase');
        return false;
      }

      setError(err.message || 'Purchase failed');
      return false;
    }
  }

  async function restorePurchases(): Promise<boolean> {
    try {
      setError(null);
      console.log('Restoring purchases...');

      const restoredInfo = await Purchases.restorePurchases();
      setCustomerInfo(restoredInfo);

      console.log('Purchases restored');
      return true;
    } catch (err) {
      console.error('Restore purchases error:', err);
      setError(err instanceof Error ? err.message : 'Restore failed');
      return false;
    }
  }

  async function refreshCustomerInfo() {
    await fetchCustomerInfo();
  }

  const isSubscriber =
    customerInfo?.entitlements.active &&
    Object.keys(customerInfo.entitlements.active).length > 0;

  return (
    <RevenueCatContext.Provider
      value={{
        offerings,
        customerInfo,
        isSubscriber: Boolean(isSubscriber),
        isLoading,
        error,
        purchasePackage,
        restorePurchases,
        refreshCustomerInfo,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within RevenueCatProvider');
  }
  return context;
}
