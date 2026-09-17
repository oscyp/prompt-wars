import { GameText as Text, GamePanel } from '@/components/game';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, TouchableOpacity } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { PRODUCT_IDS } from '@/utils/revenuecat';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import {
  findPackageForProduct,
  offerPriceStrings,
} from '@/utils/storePackages';
import type { FirstTimeOffer } from '@/utils/dailyMeta';
import FirstTimeOfferModal from './FirstTimeOfferModal';

/** Home's live store integration. Checking an existing purchase never buys. */
export default function HomeFirstTimeOffer({
  state,
  returnFocusRef,
  onSettled,
  onDismiss,
}: {
  state: FirstTimeOffer | null;
  returnFocusRef?: React.RefObject<View | null>;
  onSettled: () => Promise<void>;
  onDismiss: () => void;
}) {
  const {
    offerings,
    purchasePackage,
    pendingPurchase,
    fulfilledPurchase,
    checkPendingPurchase,
  } = useRevenueCat();
  const colors = useThemedColors();
  // Preserve the sheet instance through a settled/dismissed server refresh so
  // its native dismissal can return focus even when the offer row disappears.
  const lastOffer = useRef(state?.offer);
  if (state?.offer) lastOffer.current = state.offer;
  const productId = state?.offer?.product_id ?? PRODUCT_IDS.FTUO_STARTER;
  const pkg = useMemo(
    () => findPackageForProduct(offerings, productId),
    [offerings, productId],
  );
  const prices = offerPriceStrings(pkg);
  const [previouslyFulfilled, setFulfilled] = useState(false);
  const verifiedOffer = fulfilledPurchase?.productId === productId;
  const fulfilled = previouslyFulfilled || verifiedOffer;
  const handledFulfillment = useRef<typeof fulfilledPurchase>(null);
  // Home is keyed by account. Retain a verified offer across subsequent product
  // events and stale/failed offer refreshes so it can never reopen checkout.
  useEffect(() => {
    if (!fulfilledPurchase) return;
    if (verifiedOffer) setFulfilled(true);
    if (handledFulfillment.current === fulfilledPurchase) return;
    handledFulfillment.current = fulfilledPurchase;
    void onSettled().catch(() => {
      Alert.alert(
        'Purchase verified',
        'Pull to refresh your wallet when connected.',
      );
    });
  }, [fulfilledPurchase, verifiedOffer, onSettled]);
  const running = useRef(false);
  const pendingOffer =
    !!pendingPurchase && pendingPurchase.productId === productId;
  const check = async () => {
    if (running.current || !pendingPurchase) return;
    running.current = true;
    try {
      await checkPendingPurchase();
    } catch {
      Alert.alert(
        'Still processing',
        'Could not verify the purchase. Check again when connected.',
      );
    } finally {
      running.current = false;
    }
  };
  const claim = async () => {
    if (running.current || pendingPurchase || fulfilled || !pkg) return false;
    running.current = true;
    try {
      const storeCompleted = await purchasePackage(pkg);
      if (storeCompleted) await checkPendingPurchase();
      // Store completion can precede the server grant. The provider event closes
      // a fulfilled offer; never dismiss the server offer as a purchase side effect.
      return false;
    } catch {
      Alert.alert(
        'Still processing',
        'Check again to verify your purchase when connected.',
      );
      return false;
    } finally {
      running.current = false;
    }
  };
  const showInlineRecovery = !state?.offer && pendingOffer && !fulfilled;
  return (
    <>
      {showInlineRecovery ? (
        <GamePanel style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text }}>
            Your one-time offer purchase is still processing. You do not need to
            purchase again.
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => void check()}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.primary }}>Check again</Text>
          </TouchableOpacity>
        </GamePanel>
      ) : null}
      <FirstTimeOfferModal
        returnFocusRef={returnFocusRef}
        visible={
          !showInlineRecovery &&
          !!state?.offer &&
          !fulfilled &&
          (!!state?.eligible || pendingOffer)
        }
        offer={state?.offer ?? lastOffer.current}
        expiresAt={state?.expires_at}
        priceString={prices.priceString}
        referencePriceString={prices.referencePriceString}
        pending={!!pendingPurchase}
        onCheckAgain={() => void check()}
        onClaim={claim}
        onDismiss={onDismiss}
      />
    </>
  );
}
