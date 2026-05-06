import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography } from '@/constants/DesignTokens';
import { getWalletBalance, getWalletTransactions, WalletBalance } from '@/utils/monetization';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { PRODUCT_IDS } from '@/utils/revenuecat';

export default function WalletScreen() {
  const colors = useThemedColors();
  const { offerings, purchasePackage, restorePurchases, isLoading: rcLoading } = useRevenueCat();

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
            <Text style={[styles.subscriberText, { color: colors.primary }]}>
              ✨ Prompt Wars+ Active
            </Text>
            <Text style={[styles.allowanceText, { color: colors.textSecondary }]}>
              {balance.monthly_video_allowance_remaining} video reveals remaining this month
            </Text>
          </View>
        )}
      </View>

      {/* Credit Packs */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Credit Packs</Text>
      <View style={styles.packsContainer}>
        <CreditPackButton
          title="Starter"
          credits={10}
          price="$0.99"
          productId={PRODUCT_IDS.CREDITS_10}
          onPress={handlePurchase}
          isPurchasing={isPurchasing}
          colors={colors}
        />
        <CreditPackButton
          title="Standard"
          credits={50}
          price="$3.99"
          productId={PRODUCT_IDS.CREDITS_30}
          onPress={handlePurchase}
          isPurchasing={isPurchasing}
          colors={colors}
        />
        <CreditPackButton
          title="Premium"
          credits={120}
          price="$7.99"
          productId={PRODUCT_IDS.CREDITS_80}
          onPress={handlePurchase}
          isPurchasing={isPurchasing}
          colors={colors}
        />
      </View>

      {/* Subscription */}
      {!balance?.is_subscriber && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Prompt Wars+</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>$9.99/month</Text>
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
      <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={isPurchasing}>
        <Text style={[styles.restoreButtonText, { color: colors.primary }]}>Restore Purchases</Text>
      </TouchableOpacity>
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
  subscriberText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  allowanceText: {
    fontSize: Typography.sizes.sm,
    marginTop: Spacing.xs,
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
  restoreButtonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
});

