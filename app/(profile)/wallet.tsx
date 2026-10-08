import TransactionRow, {
  type WalletTransaction,
} from '@/components/wallet/TransactionRow';
import { CreditAmount } from '@/components/game/CreditAmount';
import { GameFeedback } from '@/components/game/GameFeedback';
import {
  GameText as Text,
  GamePanel,
  GameBevel,
  GameButton,
} from '@/components/game';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
  AppState,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
  Layout,
} from '@/constants/DesignTokens';
import { Links } from '@/constants/Links';
import SubscriberBadge from '@/components/SubscriberBadge';
import Toast from '@/components/Toast';
import {
  getWalletBalanceResult,
  getCinematicCapabilities,
  type CinematicCapabilities,
  type WalletBalance,
} from '@/utils/monetization';
import { readWalletLedger } from '@/utils/walletRecovery';
import { bestValueProductId } from '@/utils/storePackages';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_META,
  PLUS_ENTITLEMENT_ID,
  plusSubscriptionPeriod,
} from '@/utils/revenuecat';
import { formatCredits } from '@/utils/credits';
import {
  CREDIT_USES_TITLE,
  PRICES_UNAVAILABLE,
  VIDEO_PRICE_NOTE,
  creditUses,
  fetchCreditPrices,
  type CreditUse,
} from '@/utils/creditUses';
import {
  BALANCE_POLL_DELAYS_MS,
  allowanceLabel,
  longerCinematicBenefit,
  autoRenewDisclosure,
  subscriptionManageUrl,
  subscriptionRenewalLabel,
} from '@/utils/walletView';

type LoadState = 'loading' | 'ready' | 'error';

const TOAST_MS = 2500;

export default function WalletScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const accessibleText = useAccessibleTextStyle();
  const {
    offerings,
    pendingPurchase,
    checkPendingPurchase,
    customerInfo,
    purchase,
    restorePurchases,
    isLoading: rcLoading,
  } = useRevenueCat();

  // Derived from the live offering: only packs the store actually sells are
  // shown, with the store's own localized price string. Unknown product ids are
  // skipped rather than rendered with a guessed credit count.
  const plusPackages = (offerings?.current?.availablePackages ?? [])
    .flatMap((pkg) => {
      const period = plusSubscriptionPeriod(pkg.product.identifier);
      return period ? [{ pkg, period }] : [];
    })
    .sort((a, b) =>
      a.period === b.period ? 0 : a.period === 'month' ? -1 : 1,
    );

  const bestValue = bestValueProductId(
    offerings?.current?.availablePackages ?? [],
  );
  const creditPackages = (offerings?.current?.availablePackages ?? [])
    .map((pkg) => {
      const productId = pkg.product.identifier;
      const credits = CREDIT_PACK_CREDITS[productId];
      const meta = CREDIT_PACK_META[productId];
      if (credits === undefined || !meta) return null;
      return {
        productId,
        credits,
        title: meta.title,
        badge: productId === bestValue ? 'Best value' : undefined,
        price: pkg.product.priceString,
        order: meta.order,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.order - b.order);

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [cinematicCapabilities, setCinematicCapabilities] =
    useState<CinematicCapabilities | null>(null);
  const cinematicBenefit = longerCinematicBenefit(cinematicCapabilities);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  // `null` when the price table could not be read: the card says so rather
  // than listing nothing, and never invents a number.
  const [ledgerError, setLedgerError] = useState(false);
  const [uses, setUses] = useState<CreditUse[] | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [awaitingBalance, setAwaitingBalance] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Every timer this screen sets, so unmounting mid-poll cannot set state on a
  // dead component or keep re-reading the wallet after the player has left.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      if (mounted.current) fn();
    }, ms);
    timers.current.push(id);
  }, []);

  const showToast = useCallback(
    (text: string) => {
      setToast(text);
      schedule(() => setToast(null), TOAST_MS);
    },
    [schedule],
  );

  const loadWalletData =
    useCallback(async (): Promise<WalletBalance | null> => {
      const [balanceResult, transactionsData, prices, capabilities] =
        await Promise.all([
          getWalletBalanceResult(),
          readWalletLedger(20)
            .then((data) => ({ data, error: false }))
            .catch(() => ({ data: [], error: true })),
          fetchCreditPrices(),
          getCinematicCapabilities(),
        ]);
      if (!mounted.current) return null;
      setUses(prices ? creditUses(prices) : null);
      setCinematicCapabilities(capabilities);
      if (!balanceResult.ok) {
        // A failed read must not render as "0 credits". Keep whatever we last
        // knew and show the error state only when we know nothing.
        setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
        return null;
      }
      setBalance(balanceResult.balance);
      setLedgerError(transactionsData.error);
      if (!transactionsData.error)
        setTransactions(transactionsData.data as WalletTransaction[]);
      setLoadState('ready');
      return balanceResult.balance;
    }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWalletData();
      void checkPendingPurchase().catch(() => {});
    }, [loadWalletData, checkPendingPurchase]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadWalletData();
    });
    return () => subscription.remove();
  }, [loadWalletData]);

  const retry = () => {
    setLoadState('loading');
    loadWalletData();
  };

  /**
   * The webhook grants credits asynchronously. Re-read at a few widening
   * intervals and stop as soon as the balance moves; say so on screen while
   * waiting so the unchanged number does not read as a failed purchase.
   */
  const pollBalanceAfterPurchase = useCallback(() => {
    setAwaitingBalance(true);
    let settled = false;
    BALANCE_POLL_DELAYS_MS.forEach((delay, index) => {
      schedule(async () => {
        if (settled) return;
        await loadWalletData();
        const fulfilled = await checkPendingPurchase().catch(() => false);
        if (!mounted.current) return;
        const changed = fulfilled;
        const last = index === BALANCE_POLL_DELAYS_MS.length - 1;
        if (changed || last) {
          settled = true;
          setAwaitingBalance(false);
        }
      }, delay);
    });
  }, [loadWalletData, schedule, checkPendingPurchase]);

  async function handlePurchase(productId: string) {
    // Both failure paths used to `console.warn` and return, so tapping a
    // purchase button did nothing at all with no on-screen feedback -- which
    // looks identical to the app being broken. A store misconfiguration is
    // exactly when the user most needs to be told something, so it surfaces.
    if (!offerings?.current) {
      Alert.alert(
        'Store unavailable',
        'Could not load products from the store. Check your connection and try again.',
      );
      return;
    }

    const pkg = offerings.current.availablePackages.find(
      (p) => p.product.identifier === productId,
    );

    if (!pkg) {
      console.warn(
        `Package not found for "${productId}". Available: ` +
          offerings.current.availablePackages
            .map((p) => p.product.identifier)
            .join(', '),
      );
      Alert.alert(
        'Not available',
        'This item is not available in your region or store account yet.',
      );
      return;
    }

    setIsPurchasing(true);
    const outcome = await purchase(pkg);
    if (!mounted.current) return;
    setIsPurchasing(false);

    switch (outcome) {
      case 'purchased':
        showToast('Purchase complete — credits arrive in a moment');
        pollBalanceAfterPurchase();
        break;
      case 'pending':
        showToast('Still processing. Check again before buying anything else.');
        pollBalanceAfterPurchase();
        break;
      case 'failed':
        Alert.alert(
          'Couldn’t complete the purchase',
          'Could not open the store. Check your connection and try again.',
        );
        break;
      case 'cancelled':
      default:
        // The player closed the store sheet. Nothing to say.
        break;
    }
  }

  async function handleRestore() {
    setIsRestoring(true);
    const outcome = await restorePurchases();
    if (!mounted.current) return;
    setIsRestoring(false);
    switch (outcome) {
      case 'restored':
        showToast('Purchases restored');
        schedule(() => {
          loadWalletData();
        }, 1000);
        break;
      case 'nothing':
        showToast('Nothing to restore');
        break;
      case 'failed':
      default:
        Alert.alert(
          'Couldn’t restore purchases',
          'Check your connection and that you’re signed in to the right store account.',
        );
        break;
    }
  }

  const busy = isPurchasing || isRestoring;
  const topInset = Spacing.md;

  if (loadState === 'loading' || rcLoading) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <GameFeedback icon="wallet" title="Loading your wallet" busy />
      </View>
    );
  }

  if (loadState === 'error') {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <GameFeedback
          icon="wallet"
          title="Couldn’t load your balance"
          message="Check your connection and try again."
          tone="error"
          action={{ label: 'Retry', onPress: retry }}
        />
      </View>
    );
  }

  const plusEntitlement =
    customerInfo?.entitlements.active[PLUS_ENTITLEMENT_ID];
  const renewalLabel = subscriptionRenewalLabel(plusEntitlement);
  const isSubscriber = Boolean(balance?.is_subscriber);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: topInset }]}
      >
        {/* Balance Card */}
        <GamePanel style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
            style={[styles.cardTitle, accessibleText, { color: colors.text }]}
          >
            Current Balance
          </Text>
          <CreditAmount
            amount={balance?.credits_balance ?? null}
            size="large"
          />
          {awaitingBalance ? (
            <View style={styles.updatingRow} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text
                style={[styles.updatingText, { color: colors.textSecondary }]}
              >
                Updating balance…
              </Text>
            </View>
          ) : null}
          {isSubscriber && balance ? (
            <View style={styles.subscriberBlock}>
              <SubscriberBadge suffix="Active" />
              <Text
                style={[
                  styles.allowanceText,
                  NumericFontVariant,
                  { color: colors.textSecondary },
                ]}
              >
                {allowanceLabel(balance.monthly_video_allowance_remaining)}
              </Text>
              {cinematicBenefit ? (
                <Text
                  style={[
                    styles.allowanceText,
                    accessibleText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {cinematicBenefit}
                </Text>
              ) : null}
              {renewalLabel ? (
                <Text
                  style={[
                    styles.allowanceText,
                    { color: colors.textSecondary },
                  ]}
                >
                  {renewalLabel}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(subscriptionManageUrl(Platform.OS))
                }
                accessibilityRole="link"
                accessibilityLabel="Manage subscription"
                style={styles.manageLink}
              >
                <Text
                  style={[styles.manageLinkText, { color: colors.primary }]}
                >
                  Manage subscription
                </Text>
                <GameSymbol
                  name="open-outline"
                  size={14}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </GamePanel>

        {/* What credits buy: the live price of each paid action, so the packs
            below are priced against something. Videos are priced per battle
            at the moment of purchase, so they are named, not numbered. */}
        <GamePanel style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            variant="title"
            accessibilityRole="header"
            style={[styles.cardTitle, accessibleText, { color: colors.text }]}
          >
            {CREDIT_USES_TITLE}
          </Text>
          {uses && uses.length > 0 ? (
            <>
              {uses.map((use, index) => (
                <View
                  key={use.key}
                  accessible
                  accessibilityLabel={`${use.label}, ${formatCredits(use.credits, 'sentence')}`}
                  style={[
                    styles.useRow,
                    { borderTopColor: colors.border },
                    index === 0 && styles.useRowFirst,
                  ]}
                >
                  <Text
                    style={[
                      styles.useLabel,
                      accessibleText,
                      { color: colors.text },
                    ]}
                  >
                    {use.label}
                  </Text>
                  <View
                    style={[
                      styles.priceChip,
                      { backgroundColor: colors.backgroundTertiary },
                    ]}
                  >
                    <CreditAmount
                      amount={use.credits}
                      size="small"
                      accessible={false}
                    />
                  </View>
                </View>
              ))}
              <Text
                style={[
                  styles.useNote,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                {VIDEO_PRICE_NOTE}
              </Text>
            </>
          ) : (
            <Text
              style={[
                styles.useNote,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              {PRICES_UNAVAILABLE}
            </Text>
          )}
        </GamePanel>

        {/* Cosmetic shop entry */}
        <GameButton
          label="Cosmetic Shop"
          gameIcon="hanger"
          chrome="utility"
          accessibilityLabel="Open cosmetic shop"
          onPress={() => router.push('/(profile)/shop')}
        />

        {pendingPurchase ? (
          <GamePanel
            style={[styles.card, { backgroundColor: colors.card }]}
            accessibilityLiveRegion="polite"
          >
            <Text
              variant="title"
              style={[styles.cardTitle, { color: colors.text }]}
            >
              Still processing
            </Text>
            <Text style={{ color: colors.textSecondary }}>
              Your purchase is waiting for confirmation. You do not need to
              purchase again.
            </Text>
            <TouchableOpacity
              style={styles.restoreButton}
              accessibilityRole="button"
              onPress={() => {
                void checkPendingPurchase()
                  .then(() => loadWalletData())
                  .catch(() =>
                    showToast('Could not check purchase. Try again.'),
                  );
              }}
            >
              <Text style={{ color: colors.primary }}>Check again</Text>
            </TouchableOpacity>
          </GamePanel>
        ) : null}
        {/* Credit Packs — rendered from the live RevenueCat offering.
            Credits come from CREDIT_PACK_CREDITS (which mirrors the server's
            authoritative map) and price from the store product itself. */}
        <Text
          variant="title"
          accessibilityRole="header"
          style={[styles.sectionTitle, accessibleText, { color: colors.text }]}
        >
          Credit Packs
        </Text>
        {creditPackages.length === 0 ? (
          <Text
            style={[
              styles.packsEmpty,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            Credit packs are unavailable right now. Please try again later.
          </Text>
        ) : (
          <View style={styles.packsContainer}>
            {creditPackages.map((pack) => (
              <CreditPackButton
                key={pack.productId}
                title={pack.title}
                credits={pack.credits}
                price={pack.price}
                badge={pack.badge}
                productId={pack.productId}
                onPress={handlePurchase}
                disabled={busy || Boolean(pendingPurchase)}
                colors={colors}
              />
            ))}
          </View>
        )}

        {/* Subscription */}
        {!isSubscriber ? (
          <>
            <Text
              variant="title"
              accessibilityRole="header"
              style={[
                styles.sectionTitle,
                accessibleText,
                { color: colors.text },
              ]}
            >
              Prompt Wars+
            </Text>
            <GamePanel style={[styles.card, { backgroundColor: colors.card }]}>
              <Text
                variant="title"
                style={[
                  styles.cardTitle,
                  NumericFontVariant,
                  accessibleText,
                  { color: colors.text },
                ]}
              >
                Prompt Wars+
              </Text>
              <Text
                style={[
                  styles.benefitText,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                • 30 video reveals per month{'\n'}• Exclusive badge{'\n'}•
                Cosmetic unlocks
                {cinematicBenefit ? `\n• ${cinematicBenefit}` : ''}
              </Text>
              {plusPackages.length ? (
                plusPackages.map(({ pkg, period }) => (
                  <View
                    key={pkg.product.identifier}
                    style={styles.subscriptionChoice}
                  >
                    <TouchableOpacity
                      style={[
                        styles.subscribeButton,
                        {
                          backgroundColor: colors.primary,
                          opacity: busy || pendingPurchase ? 0.5 : 1,
                        },
                      ]}
                      onPress={() => handlePurchase(pkg.product.identifier)}
                      disabled={busy || Boolean(pendingPurchase)}
                      accessibilityRole="button"
                      accessibilityLabel={`Subscribe to Prompt Wars+ for ${pkg.product.priceString} a ${period}`}
                      accessibilityState={{
                        disabled: busy || Boolean(pendingPurchase),
                        busy: isPurchasing,
                      }}
                    >
                      <Text style={styles.subscribeButtonText}>
                        {isPurchasing
                          ? 'Processing…'
                          : `${period === 'month' ? 'Monthly' : 'Annual'} · ${pkg.product.priceString}/${period}`}
                      </Text>
                    </TouchableOpacity>
                    <Text
                      style={[
                        styles.disclosure,
                        accessibleText,
                        { color: colors.textTertiary },
                      ]}
                    >
                      {autoRenewDisclosure(pkg.product.priceString, period)}
                    </Text>
                  </View>
                ))
              ) : (
                <TouchableOpacity
                  style={[
                    styles.subscribeButton,
                    { backgroundColor: colors.primary, opacity: 0.5 },
                  ]}
                  disabled
                  accessibilityRole="button"
                  accessibilityLabel="Subscribe to Prompt Wars+, unavailable right now"
                  accessibilityState={{ disabled: true }}
                >
                  <Text style={styles.subscribeButtonText}>
                    Unavailable right now
                  </Text>
                </TouchableOpacity>
              )}
            </GamePanel>
          </>
        ) : null}

        <GamePanel style={{ marginTop: 20 }}>
          {/* Transaction History */}
          <Text
            variant="title"
            accessibilityRole="header"
            style={[
              styles.sectionTitle,
              accessibleText,
              { color: colors.text },
            ]}
          >
            Recent Transactions
          </Text>
          {ledgerError ? (
            <View>
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                Couldn’t load transactions.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Retry transactions"
                style={styles.restoreButton}
                onPress={() => void loadWalletData()}
              >
                <Text style={{ color: colors.primary }}>
                  Retry transactions
                </Text>
              </TouchableOpacity>
            </View>
          ) : transactions.length === 0 ? (
            <Text
              style={[
                styles.packsEmpty,
                accessibleText,
                { color: colors.textSecondary },
              ]}
            >
              No transactions yet.
            </Text>
          ) : (
            transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                onOpenBattle={(route) => router.push(route)}
              />
            ))
          )}
        </GamePanel>

        {/* Restore Purchases */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={busy || Boolean(pendingPurchase)}
          accessibilityRole="button"
          accessibilityLabel="Restore purchases"
          accessibilityState={{ disabled: busy, busy: isRestoring }}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
              Restore Purchases
            </Text>
          )}
        </TouchableOpacity>

        {/* App Store 3.1.2 requires Terms and Privacy on any surface that sells
            a subscription or consumable. */}
        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() => Linking.openURL(Links.termsAndConditions)}
            accessibilityRole="link"
            accessibilityLabel="Terms and conditions"
            style={styles.legalButton}
          >
            <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
              Terms &amp; Conditions
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalDot, { color: colors.textTertiary }]}>
            •
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(Links.privacyPolicy)}
            accessibilityRole="link"
            accessibilityLabel="Privacy policy"
            style={styles.legalButton}
          >
            <Text style={[styles.legalLink, { color: colors.textSecondary }]}>
              Privacy Policy
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      {toast ? <Toast text={toast} /> : null}
    </View>
  );
}

function CreditPackButton({
  title,
  credits,
  price,
  badge,
  productId,
  onPress,
  disabled,
  colors,
}: {
  title: string;
  credits: number;
  price: string;
  badge?: string;
  productId: string;
  onPress: (productId: string) => void;
  disabled: boolean;
  colors: ReturnType<typeof useThemedColors>;
}) {
  const creditsSentence = formatCredits(credits, 'sentence');
  return (
    <TouchableOpacity
      style={[
        styles.packCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={() => onPress(productId)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title} pack, ${creditsSentence} for ${price}${
        badge ? `, ${badge}` : ''
      }`}
      accessibilityState={{ disabled }}
    >
      <GameBevel
        color={colors.ornamentMuted}
        insetColor={colors.ornamentMuted}
        fill={colors.card}
      />
      {badge && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Text variant="title" style={[styles.packTitle, { color: colors.text }]}>
        {title}
      </Text>
      <CreditAmount amount={credits} accessible={false} />
      <Text
        style={[
          styles.packPrice,
          NumericFontVariant,
          { color: colors.textSecondary },
        ]}
      >
        {price}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  errorTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  errorBody: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.md,
    minHeight: Layout.inputHeight,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#171225',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.sm,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.sm,
  },
  updatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  updatingText: {
    fontSize: Typography.sizes.sm,
  },
  subscriberBlock: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  allowanceText: {
    fontSize: Typography.sizes.sm,
  },
  manageLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: Layout.inputHeight,
    alignSelf: 'flex-start',
  },
  manageLinkText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  useRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: Layout.inputHeight,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  useRowFirst: {
    borderTopWidth: 0,
  },
  useLabel: {
    flex: 1,
    fontSize: Typography.sizes.base,
  },
  priceChip: {
    minHeight: 28,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
  },
  priceChipText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  useNote: {
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  shopLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.md,
  },
  shopLinkLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  shopLinkText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  sectionTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  packsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  packsEmpty: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.lg,
  },
  packCard: {
    width: '100%',
    padding: Spacing.md,
    marginHorizontal: 0,
    alignItems: 'center',
    position: 'relative',
    minHeight: Layout.inputHeight,
  },
  badge: {
    position: 'absolute',
    top: -8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: '#171225',
  },
  packTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.xs,
  },
  packCredits: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  packPrice: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
  },
  benefitText: {
    fontSize: Typography.sizes.base,
    marginBottom: Spacing.md,
    lineHeight: 24,
  },
  subscribeButton: {
    minHeight: Layout.buttonHeight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionChoice: {
    marginBottom: Spacing.md,
  },
  subscribeButtonText: {
    color: '#171225',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  disclosure: {
    fontSize: Typography.sizes.xs,
    lineHeight: 17,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  transactionText: { flex: 1 },
  transactionReason: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.medium,
  },
  transactionDate: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
  },
  transactionAmount: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  restoreButton: {
    minHeight: Layout.inputHeight,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  legalButton: {
    minHeight: Layout.inputHeight,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  legalLink: {
    fontSize: Typography.sizes.xs,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: Typography.sizes.xs,
  },
});
