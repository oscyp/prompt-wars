import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { Links } from '@/constants/Links';
import SubscriberBadge from '@/components/SubscriberBadge';
import { getWalletBalance, getWalletTransactions, WalletBalance } from '@/utils/monetization';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { CREDIT_PACK_CREDITS, CREDIT_PACK_META, PRODUCT_IDS } from '@/utils/revenuecat';

export default function WalletScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const { offerings, purchasePackage, restorePurchases, isLoading: rcLoading } = useRevenueCat();

  // Derived from the live offering: only packs the store actually sells are
  // shown, with the store's own localized price string. Unknown product ids are
  // skipped rather than rendered with a guessed credit count.
  const isLoadingOfferings = rcLoading;
  // Same reasoning as the credit packs: the subscription price was a hardcoded
  // "$9.99/month" that could drift from App Store Connect, and would show the
  // wrong currency to every non-US user.
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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    loadWalletData();
  }, []);

  async function loadWalletData() {
    setIsLoading(true);
    const [balanceData, transactionsData] = await Promise.all([
      getWalletBalance(),
      getWalletTransactions(20),
    ]);
    setBalance(balanceData);
    setTransactions(transactionsData);
    setIsLoading(false);
  }

  async function handlePurchase(productId: string) {
    if (!offerings?.current) {
      console.warn('No offerings available');
      return;
    }

    const pkg = offerings.current.availablePackages.find(
      (p) => p.product.identifier === productId
    );

    if (!pkg) {
      console.warn('Package not found:', productId);
      return;
    }

    setIsPurchasing(true);
    const success = await purchasePackage(pkg);
    setIsPurchasing(false);

    if (success) {
      // Reload wallet after purchase (webhook will have processed)
      setTimeout(() => loadWalletData(), 2000);
    }
  }

  async function handleRestore() {
    setIsPurchasing(true);
    await restorePurchases();
    setIsPurchasing(false);
    setTimeout(() => loadWalletData(), 1000);
  }

  if (isLoading || rcLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Wallet & Subscription</Text>

      {/* Balance Card */}
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Current Balance</Text>
        <Text style={[styles.balanceAmount, { color: colors.primary }]}>
          {balance?.credits_balance ?? 0} Credits
        </Text>
        {balance?.is_subscriber && (
          <View style={styles.subscriberBadge}>
            <SubscriberBadge suffix="Active" />
            <Text style={[styles.allowanceText, { color: colors.textSecondary }]}>
              {balance.monthly_video_allowance_remaining} video reveals remaining this month
            </Text>
          </View>
        )}
      </View>

      {/* Cosmetic shop entry */}
      <TouchableOpacity
        style={[styles.shopLink, { backgroundColor: colors.card, borderColor: colors.primary }]}
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
          <Text style={[styles.shopLinkText, { color: colors.text }]}>
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
          These were hardcoded, and the literals had drifted from the products:
          "Standard" advertised 50 credits for $3.99 on a button carrying
          credits_30, and the server grants 30. Price came from a literal too,
          so it could diverge from App Store Connect without anyone noticing.
          Credits now come from CREDIT_PACK_CREDITS (which mirrors the server's
          authoritative map) and price from the store product itself. */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Credit Packs</Text>
      {creditPackages.length === 0 ? (
        <Text style={[styles.packsEmpty, { color: colors.textSecondary }]}>
          {isLoadingOfferings
            ? 'Loading credit packs…'
            : 'Credit packs are unavailable right now. Please try again later.'}
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
              isPurchasing={isPurchasing}
              colors={colors}
            />
          ))}
        </View>
      )}

      {/* Subscription */}
      {!balance?.is_subscriber && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Prompt Wars+</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {plusPackage ? `${plusPackage.product.priceString}/month` : 'Prompt Wars+'}
            </Text>
            <Text style={[styles.benefitText, { color: colors.textSecondary }]}>
              • 30 video reveals per month{'\n'}
              • Exclusive badge{'\n'}
              • Priority queue{'\n'}
              • Cosmetic unlocks{'\n'}
              • Full video history
            </Text>
            <TouchableOpacity
              style={[styles.subscribeButton, { backgroundColor: colors.primary }]}
              onPress={() => handlePurchase(PRODUCT_IDS.PLUS_MONTHLY)}
              disabled={isPurchasing}
            >
              <Text style={styles.subscribeButtonText}>
                {isPurchasing ? 'Processing...' : 'Subscribe Now'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Transaction History */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Transactions</Text>
      {transactions.map((tx) => (
        <View key={tx.id} style={[styles.transactionRow, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.transactionReason, { color: colors.text }]}>{tx.reason}</Text>
            <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
              {new Date(tx.created_at).toLocaleDateString()}
            </Text>
          </View>
          <Text
            style={[
              styles.transactionAmount,
              { color: tx.amount > 0 ? colors.success : colors.error },
            ]}
          >
            {tx.amount > 0 ? '+' : ''}
            {tx.amount}
          </Text>
        </View>
      ))}

      {/* Restore Purchases */}
      <TouchableOpacity
        style={styles.restoreButton}
        onPress={handleRestore}
        disabled={isPurchasing}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
      >
        <Text style={[styles.restoreButtonText, { color: colors.primary }]}>Restore Purchases</Text>
      </TouchableOpacity>

      {/* App Store 3.1.2 requires Terms and Privacy on any surface that sells
          a subscription or consumable. */}
      <View style={styles.legalRow}>
        <Text
          style={[styles.legalLink, { color: colors.textSecondary }]}
          onPress={() => Linking.openURL(Links.termsAndConditions)}
          accessibilityRole="link"
          accessibilityLabel="Terms and conditions"
        >
          Terms &amp; Conditions
        </Text>
        <Text style={[styles.legalDot, { color: colors.textTertiary }]}>•</Text>
        <Text
          style={[styles.legalLink, { color: colors.textSecondary }]}
          onPress={() => Linking.openURL(Links.privacyPolicy)}
          accessibilityRole="link"
          accessibilityLabel="Privacy policy"
        >
          Privacy Policy
        </Text>
      </View>
    </ScrollView>
  );
}

function CreditPackButton({
  title,
  credits,
  price,
  badge,
  productId,
  onPress,
  isPurchasing,
  colors,
}: {
  title: string;
  credits: number;
  price: string;
  badge?: string;
  productId: string;
  onPress: (productId: string) => void;
  isPurchasing: boolean;
  colors: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.packCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(productId)}
      disabled={isPurchasing}
    >
      {badge && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.packTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.packCredits, { color: colors.primary }]}>{credits} Credits</Text>
      <Text style={[styles.packPrice, { color: colors.textSecondary }]}>{price}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizes.xxxl,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: 12,
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
    marginBottom: Spacing.md,
  },
  subscriberBadge: {
    marginTop: Spacing.sm,
  },
  allowanceText: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
  },
  shopLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: 12,
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
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: Spacing.xs,
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
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
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.bold,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
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
    padding: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  legalLink: {
    fontSize: Typography.sizes.xs,
    textDecorationLine: 'underline',
  },
  legalDot: {
    fontSize: Typography.sizes.xs,
  },
  restoreButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});

