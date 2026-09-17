import { GameText as Text, GameButton } from '@/components/game';
import BottomSheet from '@/components/sheets/BottomSheet';
import { useBattlePresentationActive } from '@/components/game/battle/useBattlePresentationActive';
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { GameSymbol } from '@/components/game/icons/GameSymbol';
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
  returnFocusRef?: React.RefObject<View | null>;
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
  pending?: boolean;
  onCheckAgain?: () => void;
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
  returnFocusRef,
  offer,
  expiresAt,
  priceString,
  referencePriceString,
  onClaim,
  pending = false,
  onCheckAgain,
  onDismiss,
}: FirstTimeOfferModalProps) {
  const colors = useThemedColors();
  const active = useBattlePresentationActive();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const [purchasing, setPurchasing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A ticking second hand is motion. Under Reduce Motion the countdown still
  // updates, once a minute, so the offer never shows a stale hour.
  useEffect(() => {
    if (!visible || !active || !expiresAt) return;
    setNow(Date.now());
    const id = setInterval(
      () => setNow(Date.now()),
      reduceMotion ? 60_000 : 1000,
    );
    return () => clearInterval(id);
  }, [visible, expiresAt, reduceMotion, active]);

  if (!offer) return null;

  const remaining = remainingMs(expiresAt, now);
  const expired = remaining !== null && remaining <= 0;

  const handleClaim = async () => {
    if (expired || pending) return;
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
    <BottomSheet
      returnFocusRef={returnFocusRef}
      visible={visible}
      onClose={handleDismiss}
      dismissDisabled={purchasing}
      closeAccessibilityLabel="Close offer"
      title={offer.title}
      footer={
        <View style={{ gap: 8 }}>
          {pending ? (
            <View style={{ gap: 8 }}>
              <Text>Still processing. You do not need to purchase again.</Text>
              <GameButton
                label="Check again"
                tone="secondary"
                onPress={onCheckAgain}
              />
            </View>
          ) : null}
          <GameButton
            label={
              pending
                ? 'Still processing'
                : expired
                  ? OFFER_ENDED_LABEL
                  : 'Claim Offer'
            }
            accessibilityLabel={
              expired ? OFFER_ENDED_LABEL : 'Claim one-time offer'
            }
            onPress={handleClaim}
            busy={purchasing}
            disabled={expired || pending}
          />
          <GameButton
            label={expired ? 'Close' : 'Maybe later'}
            tone="secondary"
            onPress={handleDismiss}
            disabled={purchasing}
          />
        </View>
      }
    >
      <View
        style={[
          styles.ribbon,
          { backgroundColor: colors.ornament, alignSelf: 'center' },
        ]}
      >
        <Text variant="label" style={styles.ribbonText}>
          ONE-TIME OFFER
        </Text>
      </View>
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
          <Text style={[styles.rewardLabel, { color: colors.textSecondary }]}>
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
            <GameSymbol name="star" size={26} color={colors.warning} />
            <Text style={[styles.rewardLabel, { color: colors.textSecondary }]}>
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
            style={[styles.price, NumericFontVariant, { color: colors.text }]}
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
        <Text style={[styles.legalDot, { color: colors.textTertiary }]}>•</Text>
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
    </BottomSheet>
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
    maxHeight: '90%',
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
    color: '#171225',
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
    flexWrap: 'wrap',
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
    flexWrap: 'wrap',
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
    color: '#171225',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  dismissButton: {
    minHeight: 48,
    minWidth: 48,
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
    minHeight: 48,
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
