import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { HEADER_BUTTON_SIZE } from '@/components/HeaderBackButton';
import {
  getWalletBalanceResult,
  getWalletTransactions,
  type WalletBalance,
} from '@/utils/monetization';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import {
  CREDIT_PACK_CREDITS,
  CREDIT_PACK_META,
  PLUS_ENTITLEMENT_ID,
  PRODUCT_IDS,
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
import { transactionAmountLabel, transactionLabel } from '@/utils/walletCopy';
import {
  BALANCE_POLL_DELAYS_MS,
  allowanceLabel,
  autoRenewDisclosure,
  shortDate,
  subscriptionManageUrl,
  subscriptionRenewalLabel,
} from '@/utils/walletView';

interface WalletTransaction {
  id: string;
  reason: string | null;
  amount: number;
  created_at: string;
  /** Set when the entry came from a battle (a video, a toll, a refund). */
  battle_id?: string | null;
}

type LoadState = 'loading' | 'ready' | 'error';

const TOAST_MS = 2500;

export default function WalletScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessibleText = useAccessibleTextStyle();
  const {
    offerings,
    customerInfo,
    purchase,
    restorePurchases,
    isLoading: rcLoading,
  } = useRevenueCat();

  // Derived from the live offering: only packs the store actually sells are
  // shown, with the store's own localized price string. Unknown product ids are
  // skipped rather than rendered with a guessed credit count.
  const plusPackage = (offerings?.current?.availablePackages ?? []).find(
    (pkg) => pkg.product.identifier === PRODUCT_IDS.PLUS_MONTHLY,
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
        badge: meta.badge,
        price: pkg.product.priceString,
        order: meta.order,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.order - b.order);

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  // `null` when the price table could not be read: the card says so rather
  // than listing nothing, and never invents a number.
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
      const [balanceResult, transactionsData, prices] = await Promise.all([
        getWalletBalanceResult(),
        getWalletTransactions(20),
        fetchCreditPrices(),
      ]);
      if (!mounted.current) return null;
      setUses(prices ? creditUses(prices) : null);
      if (!balanceResult.ok) {
        // A failed read must not render as "0 credits". Keep whatever we last
        // knew and show the error state only when we know nothing.
        setLoadState((prev) => (prev === 'ready' ? 'ready' : 'error'));
        return null;
      }
      setBalance(balanceResult.balance);
      setTransactions(transactionsData as WalletTransaction[]);
      setLoadState('ready');
      return balanceResult.balance;
    }, []);

  useEffect(() => {
    loadWalletData();
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
  const pollBalanceAfterPurchase = useCallback(
    (before: number | null) => {
      setAwaitingBalance(true);
      let settled = false;
      BALANCE_POLL_DELAYS_MS.forEach((delay, index) => {
        schedule(async () => {
          if (settled) return;
          const next = await loadWalletData();
          if (!mounted.current) return;
          const changed = next !== null && next.credits_balance !== before;
          const last = index === BALANCE_POLL_DELAYS_MS.length - 1;
          if (changed || last) {
            settled = true;
            setAwaitingBalance(false);
          }
        }, delay);
      });
    },
    [loadWalletData, schedule],
  );

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
    const before = balance?.credits_balance ?? null;
    const outcome = await purchase(pkg);
    if (!mounted.current) return;
    setIsPurchasing(false);

    switch (outcome) {
      case 'purchased':
        showToast('Purchase complete — credits arrive in a moment');
        pollBalanceAfterPurchase(before);
        break;
      case 'failed':
        Alert.alert(
          'Couldn’t complete the purchase',
          'You haven’t been charged. Check your connection and try again.',
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
  const topInset = insets.top + HEADER_BUTTON_SIZE;

  if (loadState === 'loading' || rcLoading) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topInset },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
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
        <Ionicons name="wallet-outline" size={32} color={colors.textTertiary} />
        <Text
          accessibilityRole="header"
          style={[styles.errorTitle, accessibleText, { color: colors.text }]}
        >
          Couldn’t load your balance
        </Text>
        <Text
          style={[
            styles.errorBody,
            accessibleText,
            { color: colors.textSecondary },
          ]}
        >
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
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
        <Text
          accessibilityRole="header"
          style={[styles.title, accessibleText, { color: colors.text }]}
        >
          Wallet & Subscription
        </Text>

        {/* Balance Card */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
            style={[styles.cardTitle, accessibleText, { color: colors.text }]}
          >
            Current Balance
          </Text>
          <Text
            style={[
              styles.balanceAmount,
              NumericFontVariant,
              { color: colors.primary },
            ]}
            accessibilityLabel={formatCredits(
              balance?.credits_balance ?? 0,
              'sentence',
            )}
          >
            {formatCredits(balance?.credits_balance ?? 0, 'sentence')}
          </Text>
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
                <Ionicons
                  name="open-outline"
                  size={14}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* What credits buy: the live price of each paid action, so the packs
            below are priced against something. Videos are priced per battle
            at the moment of purchase, so they are named, not numbered. */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text
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
                    <Text
                      style={[
                        styles.priceChipText,
                        NumericFontVariant,
                        { color: colors.text },
                      ]}
                    >
                      {formatCredits(use.credits, 'chip')}
                    </Text>
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
        </View>

        {/* Cosmetic shop entry */}
        <TouchableOpacity
          style={[
            styles.shopLink,
            { backgroundColor: colors.card, borderColor: colors.primary },
          ]}
          onPress={() => router.push('/(profile)/shop')}
          accessibilityRole="button"
          accessibilityLabel="Open cosmetic shop"
        >
          <View style={styles.shopLinkLabel}>
            <Ionicons
              name="color-palette-outline"
              size={18}
              color={colors.primary}
            />
            <Text
              style={[
                styles.shopLinkText,
                accessibleText,
                { color: colors.text },
              ]}
            >
              Cosmetic Shop
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Credit Packs — rendered from the live RevenueCat offering.
            Credits come from CREDIT_PACK_CREDITS (which mirrors the server's
            authoritative map) and price from the store product itself. */}
        <Text
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
                disabled={busy}
                colors={colors}
              />
            ))}
          </View>
        )}

        {/* Subscription */}
        {!isSubscriber ? (
          <>
            <Text
              accessibilityRole="header"
              style={[
                styles.sectionTitle,
                accessibleText,
                { color: colors.text },
              ]}
            >
              Prompt Wars+
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text
                style={[
                  styles.cardTitle,
                  NumericFontVariant,
                  accessibleText,
                  { color: colors.text },
                ]}
              >
                {plusPackage
                  ? `${plusPackage.product.priceString}/month`
                  : 'Prompt Wars+'}
              </Text>
              <Text
                style={[
                  styles.benefitText,
                  accessibleText,
                  { color: colors.textSecondary },
                ]}
              >
                • 30 video reveals per month{'\n'}• Exclusive badge{'\n'}•
                Priority queue{'\n'}• Cosmetic unlocks{'\n'}• Full video history
              </Text>
              <TouchableOpacity
                style={[
                  styles.subscribeButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: busy || !plusPackage ? 0.5 : 1,
                  },
                ]}
                onPress={() => handlePurchase(PRODUCT_IDS.PLUS_MONTHLY)}
                disabled={busy || !plusPackage}
                accessibilityRole="button"
                accessibilityLabel={
                  plusPackage
                    ? `Subscribe to Prompt Wars+ for ${plusPackage.product.priceString} a month`
                    : 'Subscribe to Prompt Wars+, unavailable right now'
                }
                accessibilityState={{
                  disabled: busy || !plusPackage,
                  busy: isPurchasing,
                }}
              >
                <Text style={styles.subscribeButtonText}>
                  {isPurchasing
                    ? 'Processing…'
                    : plusPackage
                      ? 'Subscribe Now'
                      : 'Unavailable right now'}
                </Text>
              </TouchableOpacity>
              <Text
                style={[
                  styles.disclosure,
                  accessibleText,
                  { color: colors.textTertiary },
                ]}
              >
                {autoRenewDisclosure(plusPackage?.product.priceString)}
              </Text>
            </View>
          </>
        ) : null}

        {/* Transaction History */}
        <Text
          accessibilityRole="header"
          style={[styles.sectionTitle, accessibleText, { color: colors.text }]}
        >
          Recent Transactions
        </Text>
        {transactions.length === 0 ? (
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
              colors={colors}
            />
          ))
        )}

        {/* Restore Purchases */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={busy}
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

/**
 * One ledger line. Entries tied to a battle open its result -- a toll, a
 * video or a refund is easier to place next to the fight it came from.
 */
function TransactionRow({
  transaction: tx,
  onOpenBattle,
  colors,
}: {
  transaction: WalletTransaction;
  onOpenBattle: (route: Href) => void;
  colors: ReturnType<typeof useThemedColors>;
}) {
  const accessibleText = useAccessibleTextStyle();
  const label = transactionLabel(tx.reason);
  const amount = transactionAmountLabel(tx.amount);
  const date = shortDate(tx.created_at) ?? '';
  const route: Href | null = tx.battle_id
    ? `/(battle)/result?battleId=${tx.battle_id}`
    : null;
  const summary = `${label}, ${amount}, ${date}`;

  const body = (
    <>
      <View style={styles.transactionText}>
        <Text
          style={[
            styles.transactionReason,
            accessibleText,
            { color: colors.text },
          ]}
        >
          {label}
        </Text>
        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
          {date}
        </Text>
      </View>
      <Text
        style={[
          styles.transactionAmount,
          NumericFontVariant,
          { color: tx.amount > 0 ? colors.success : colors.error },
        ]}
      >
        {amount}
      </Text>
    </>
  );

  if (route) {
    return (
      <TouchableOpacity
        onPress={() => onOpenBattle(route)}
        accessibilityRole="button"
        accessibilityLabel={`${summary}. Opens the battle result`}
        style={[styles.transactionRow, { borderBottomColor: colors.border }]}
      >
        {body}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={summary}
      style={[styles.transactionRow, { borderBottomColor: colors.border }]}
    >
      {body}
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
      {badge && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.packTitle, { color: colors.text }]}>{title}</Text>
      <Text
        style={[
          styles.packCredits,
          NumericFontVariant,
          { color: colors.primary },
        ]}
      >
        {creditsSentence}
      </Text>
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
    color: '#FFFFFF',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  packsEmpty: {
    fontSize: Typography.sizes.sm,
    marginBottom: Spacing.lg,
  },
  packCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginHorizontal: Spacing.xs,
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
    color: '#fff',
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
  subscribeButtonText: {
    color: '#fff',
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
