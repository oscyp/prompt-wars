import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemedColors } from '@/hooks/useThemedColors';
import {
  BorderRadius,
  Gradients,
  Shadows,
  Spacing,
  Typography,
} from '@/constants/DesignTokens';
import {
  getWalletBalance,
  getWalletTransactions,
  WalletBalance,
} from '@/utils/monetization';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { PRODUCT_IDS } from '@/utils/revenuecat';
import {
  AnimatedNumber,
  Card,
  GlowGradientButton,
  HapticPressable,
  ScreenContainer,
  SectionHeader,
} from '@/components';

type Pack = {
  title: string;
  credits: number;
  price: string;
  productId: string;
  badge?: string;
  gradient: readonly string[];
};

const PACKS: Pack[] = [
  {
    title: 'Starter',
    credits: 10,
    price: '$0.99',
    productId: PRODUCT_IDS.CREDITS_10,
    gradient: Gradients.cardSurface,
  },
  {
    title: 'Standard',
    credits: 50,
    price: '$3.99',
    productId: PRODUCT_IDS.CREDITS_30,
    badge: 'BEST VALUE',
    gradient: Gradients.heroPrimary,
  },
  {
    title: 'Premium',
    credits: 120,
    price: '$7.99',
    productId: PRODUCT_IDS.CREDITS_80,
    gradient: Gradients.heroFinisher,
  },
];

export default function WalletScreen() {
  const colors = useThemedColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    offerings,
    purchasePackage,
    restorePurchases,
    isLoading: rcLoading,
  } = useRevenueCat();

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + glow.value * 0.5,
    transform: [{ scale: 0.95 + glow.value * 0.15 }],
  }));

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
    if (success) setTimeout(() => loadWalletData(), 2000);
  }

  async function handleRestore() {
    setIsPurchasing(true);
    await restorePurchases();
    setIsPurchasing(false);
    setTimeout(() => loadWalletData(), 1000);
  }

  if (isLoading || rcLoading) {
    return (
      <ScreenContainer padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: insets.bottom + Spacing.xxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <HapticPressable
          onPress={() => router.back()}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={28}
            color={colors.text}
          />
          <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
        </HapticPressable>

        <SectionHeader
          title="Wallet"
          eyebrow="Credits & subscription"
          size="hero"
        />

        {/* Balance hero */}
        <View style={styles.balanceWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.balanceGlow,
              { backgroundColor: colors.gold },
              glowStyle,
            ]}
          />
          <LinearGradient
            colors={
              Gradients.rankGold as unknown as readonly [string, string]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.balanceCard,
              Shadows.cardElevated,
              { shadowColor: colors.gold },
            ]}
          >
            <Text style={styles.balanceLabel}>CURRENT BALANCE</Text>
            <View style={styles.balanceRow}>
              <MaterialCommunityIcons name="diamond-stone" size={32} color="#FFFFFF" />
              <AnimatedNumber
                value={balance?.credits_balance ?? 0}
                style={styles.balanceValue}
              />
            </View>
            <Text style={styles.balanceCredits}>CREDITS</Text>
          </LinearGradient>
        </View>

        {/* Prompt Wars+ */}
        {balance?.is_subscriber ? (
          <Card variant="neon" style={styles.section}>
            <View style={styles.plusRow}>
              <MaterialCommunityIcons
                name="star-four-points"
                size={20}
                color={colors.accent}
              />
              <Text style={[styles.plusTitle, { color: colors.accent }]}>
                PROMPT WARS+ ACTIVE
              </Text>
            </View>
            <Text style={[styles.plusBody, { color: colors.text }]}>
              {balance.monthly_video_allowance_remaining} video reveals remaining this month
            </Text>
          </Card>
        ) : (
          <Card variant="neon" style={styles.section}>
            <SectionHeader
              title="Prompt Wars+"
              eyebrow="UPGRADE · $9.99/MO"
              size="md"
            />
            <View style={styles.benefits}>
              {[
                '30 video reveals / month',
                'Exclusive badge',
                'Priority queue',
                'Cosmetic unlocks',
                'Full video history',
              ].map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={16}
                    color={colors.accent}
                  />
                  <Text style={[styles.benefitText, { color: colors.text }]}>
                    {b}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ marginTop: Spacing.md }}>
              <GlowGradientButton
                title={isPurchasing ? 'Processing…' : 'Subscribe Now'}
                onPress={() => handlePurchase(PRODUCT_IDS.PLUS_MONTHLY)}
                variant="primary"
                size="lg"
                loading={isPurchasing}
                disabled={isPurchasing}
                fullWidth
                iconLeft="star-four-points"
              />
            </View>
          </Card>
        )}

        {/* Credit packs */}
        <View style={styles.section}>
          <SectionHeader title="Credit Packs" size="md" />
          <View style={styles.packGrid}>
            {PACKS.map((pack) => (
              <HapticPressable
                key={pack.productId}
                onPress={() => handlePurchase(pack.productId)}
                disabled={isPurchasing}
                haptic="medium"
                accessibilityRole="button"
                accessibilityLabel={`Buy ${pack.title} pack`}
                style={[styles.packShadow, Shadows.cardElevated]}
              >
                <LinearGradient
                  colors={
                    pack.gradient as unknown as readonly [string, string]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.packCard}
                >
                  {pack.badge && (
                    <View
                      style={[
                        styles.bestBadge,
                        { backgroundColor: colors.gold },
                      ]}
                    >
                      <Text style={styles.bestBadgeText}>{pack.badge}</Text>
                    </View>
                  )}
                  <Text style={styles.packTitle}>{pack.title}</Text>
                  <Text style={styles.packCredits}>{pack.credits}</Text>
                  <Text style={styles.packCreditsLabel}>CREDITS</Text>
                  <View
                    style={[
                      styles.priceTag,
                      { backgroundColor: 'rgba(0,0,0,0.25)' },
                    ]}
                  >
                    <Text style={styles.priceText}>{pack.price}</Text>
                  </View>
                </LinearGradient>
              </HapticPressable>
            ))}
          </View>
        </View>

        {/* Transactions */}
        {transactions.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Transactions" size="md" />
            <Card variant="glass" style={{ padding: 0 }}>
              {transactions.map((tx, idx) => (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    idx < transactions.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.txReason, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {tx.reason}
                    </Text>
                    <Text style={[styles.txDate, { color: colors.textTertiary }]}>
                      {new Date(tx.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      {
                        color: tx.amount > 0 ? colors.success : colors.error,
                      },
                    ]}
                  >
                    {tx.amount > 0 ? '+' : ''}
                    {tx.amount}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}

        <View style={{ marginTop: Spacing.lg }}>
          <GlowGradientButton
            title="Restore Purchases"
            onPress={handleRestore}
            variant="ghost"
            size="md"
            disabled={isPurchasing}
            fullWidth
            iconLeft="restore"
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  backText: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.base,
  },
  balanceWrap: {
    marginTop: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  balanceGlow: {
    position: 'absolute',
    width: '90%',
    height: '90%',
    borderRadius: BorderRadius.xxxl,
    opacity: 0.5,
  },
  balanceCard: {
    width: '100%',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  balanceLabel: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.sm,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  balanceValue: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.hero,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
  },
  balanceCredits: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: Typography.letterSpacing.widest,
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing.lg,
  },
  plusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.xs,
  },
  plusTitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
    letterSpacing: Typography.letterSpacing.wider,
  },
  plusBody: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.sm,
  },
  benefits: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  benefitText: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.sm,
  },
  packGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  packShadow: {
    flex: 1,
    borderRadius: BorderRadius.lg,
  },
  packCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 160,
  },
  bestBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderBottomLeftRadius: BorderRadius.md,
  },
  bestBadgeText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 9,
    color: '#000',
    letterSpacing: Typography.letterSpacing.wider,
  },
  packTitle: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.xs,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: Typography.letterSpacing.wider,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  packCredits: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.display2,
    color: '#FFFFFF',
    lineHeight: Typography.sizes.display2,
  },
  packCreditsLabel: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: Typography.letterSpacing.widest,
    marginBottom: Spacing.sm,
  },
  priceTag: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    marginTop: 'auto',
  },
  priceText: {
    fontFamily: Typography.fonts.bodyBold,
    fontSize: Typography.sizes.sm,
    color: '#FFFFFF',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  txReason: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: Typography.sizes.sm,
  },
  txDate: {
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: Typography.fonts.displayBlack,
    fontSize: Typography.sizes.base,
    marginLeft: Spacing.sm,
  },
});
