import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import {
  Spacing,
  Typography,
  BorderRadius,
  NumericFontVariant,
  Scrim,
} from '@/constants/DesignTokens';
import { Links } from '@/constants/Links';
import { formatCredits } from '@/utils/credits';
import type { FirstTimeOffer } from '@/utils/dailyMeta';

export interface FirstTimeOfferModalProps {
  visible: boolean;
  offer: FirstTimeOffer['offer'];
  expiresAt?: string;
  /**
   * The store's own localized price for the offer's product, when the caller
   * has the RevenueCat package. Falls back to the server's USD reference
   * numbers, which are wrong for every non-US storefront.
   */
  priceString?: string | null;
  /**
   * The "usually" price. `undefined` falls back to the server's USD reference;
   * `null` suppresses it, for storefronts whose currency is not USD, where the
   * USD anchor would read as a different amount than the localized price.
   */
  referencePriceString?: string | null;
  onClaim: () => Promise<boolean>;
  onDismiss: () => void;
}

export const OFFER_DISMISS_COPY = {
  title: 'Dismiss this offer?',
  message: 'This offer won’t come back.',
  keep: 'Keep offer',
  dismiss: 'Dismiss',
} as const;

export const OFFER_ENDED_LABEL = 'Offer ended';

export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0m 0s';
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h >= 1) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function remainingMs(
  expiresAt: string | undefined,
  now: number,
): number | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt).getTime();
  if (!Number.isFinite(at)) return null;
  return at - now;
}

/**
 * One-time first-time-user offer modal. Higher-value bundle + exclusive
 * cosmetic with a live countdown. Purchase is delegated to onClaim (RevenueCat
 * lives in the parent); the offer can never gate gameplay.
 *
 * Dismissal is confirmed because it is irreversible server-side (a player only
 * ever gets one offer), and the Claim button locks the moment the countdown
 * runs out so a tap at 0:00 cannot open a store sheet for a dead offer.
 */
export default function FirstTimeOfferModal({
  visible,
  offer,
  expiresAt,
  priceString,
  referencePriceString,
  onClaim,
  onDismiss,
}: FirstTimeOfferModalProps) {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const [purchasing, setPurchasing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A ticking second hand is motion. Under Reduce Motion the countdown still
  // updates, once a minute, so the offer never shows a stale hour.
  useEffect(() => {
    if (!visible || !expiresAt) return;
    setNow(Date.now());
    const id = setInterval(
      () => setNow(Date.now()),
      reduceMotion ? 60_000 : 1000,
    );
    return () => clearInterval(id);
  }, [visible, expiresAt, reduceMotion]);

  if (!offer) return null;

  const remaining = remainingMs(expiresAt, now);
  const expired = remaining !== null && remaining <= 0;

  const handleClaim = async () => {
    if (expired) return;
    setPurchasing(true);
    try {
      const ok = await onClaim();
      if (ok) onDismiss();
    } finally {
      setPurchasing(false);
    }
  };

  const handleDismiss = () => {
    // Nothing left to lose once it has ended.
    if (expired) {
      onDismiss();
      return;
    }
    Alert.alert(OFFER_DISMISS_COPY.title, OFFER_DISMISS_COPY.message, [
      { text: OFFER_DISMISS_COPY.keep, style: 'cancel' },
      {
        text: OFFER_DISMISS_COPY.dismiss,
        style: 'destructive',
        onPress: onDismiss,
      },
    ]);
  };

  const price =
    priceString ??
    (offer.price_usd != null ? `$${offer.price_usd.toFixed(2)}` : null);
  const referencePrice =
    referencePriceString === undefined
      ? offer.reference_price_usd
        ? `$${offer.reference_price_usd.toFixed(2)}`
        : null
      : referencePriceString;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.primary },
          ]}
        >
          <View style={[styles.ribbon, { backgroundColor: colors.primary }]}>
            <Text style={styles.ribbonText}>ONE-TIME OFFER</Text>
          </View>

          <Text
            accessibilityRole="header"
            style={[styles.title, accessibleText, { color: colors.text }]}
          >
            {offer.title}
          </Text>
          <Text
            style={[
              styles.description,
              accessibleText,
              { color: colors.textSecondary },
            ]}
          >
            {offer.description}
          </Text>

          <View style={styles.rewards}>
            <View
              accessible
              accessibilityLabel={formatCredits(offer.credits, 'sentence')}
              style={[
                styles.rewardPill,
                { backgroundColor: colors.backgroundTertiary },
              ]}
            >
              <Text
                style={[
                  styles.rewardValue,
                  NumericFontVariant,
                  { color: colors.primary },
                ]}
              >
                {offer.credits}
              </Text>
              <Text
                style={[styles.rewardLabel, { color: colors.textSecondary }]}
              >
                {offer.credits === 1 ? 'credit' : 'credits'}
              </Text>
            </View>
            {offer.exclusive_cosmetic_slug ? (
              <View
                accessible
                accessibilityLabel="Exclusive cosmetic"
                style={[
                  styles.rewardPill,
                  { backgroundColor: colors.backgroundTertiary },
                ]}
              >
                <Ionicons name="star" size={26} color={colors.warning} />
                <Text
                  style={[styles.rewardLabel, { color: colors.textSecondary }]}
                >
                  exclusive cosmetic
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.priceRow}>
            {referencePrice ? (
              <Text
                style={[
                  styles.refPrice,
                  NumericFontVariant,
                  { color: colors.textTertiary },
                ]}
                accessibilityLabel={`Usually ${referencePrice}`}
              >
                {referencePrice}
              </Text>
            ) : null}
            {price ? (
              <Text
                style={[
                  styles.price,
                  NumericFontVariant,
                  { color: colors.text },
                ]}
              >
                {price}
              </Text>
            ) : null}
          </View>

          {remaining !== null ? (
            <Text
              style={[
                styles.countdown,
                NumericFontVariant,
                { color: colors.error },
              ]}
              accessibilityLiveRegion="polite"
            >
              {expired
                ? 'This offer has ended.'
                : `Ends in ${formatRemaining(remaining)}`}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.claimButton,
              { backgroundColor: colors.primary, opacity: expired ? 0.5 : 1 },
            ]}
            onPress={handleClaim}
            disabled={purchasing || expired}
            accessibilityRole="button"
            accessibilityLabel={
              expired ? OFFER_ENDED_LABEL : 'Claim one-time offer'
            }
            accessibilityState={{
              disabled: purchasing || expired,
              busy: purchasing,
            }}
          >
            {purchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.claimText}>
                {expired ? OFFER_ENDED_LABEL : 'Claim Offer'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDismiss}
            disabled={purchasing}
            accessibilityRole="button"
            accessibilityLabel={expired ? 'Close' : 'Maybe later'}
            style={styles.dismissButton}
          >
            <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
              {expired ? 'Close' : 'Maybe later'}
            </Text>
          </TouchableOpacity>

          {/* App Store 3.1.2: Terms and Privacy on any surface that sells. */}
          <View style={styles.legalRow}>
            <TouchableOpacity
              onPress={() => Linking.openURL(Links.termsAndConditions)}
              accessibilityRole="link"
              accessibilityLabel="Terms and conditions"
              style={styles.legalButton}
            >
              <Text style={[styles.legalLink, { color: colors.textTertiary }]}>
                Terms
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
              <Text style={[styles.legalLink, { color: colors.textTertiary }]}>
                Privacy
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Scrim.sheet,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  ribbon: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  ribbonText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  rewards: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  rewardPill: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  rewardValue: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  rewardLabel: {
    fontSize: Typography.sizes.xs,
    marginTop: Spacing.xs,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  refPrice: {
    fontSize: Typography.sizes.base,
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  countdown: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginBottom: Spacing.md,
  },
  claimButton: {
    width: '100%',
    height: 52,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  claimText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  dismissButton: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissText: {
    fontSize: Typography.sizes.sm,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legalButton: {
    minHeight: 44,
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
