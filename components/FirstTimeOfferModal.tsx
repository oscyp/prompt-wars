import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import type { FirstTimeOffer } from '@/utils/dailyMeta';

export interface FirstTimeOfferModalProps {
  visible: boolean;
  offer: FirstTimeOffer['offer'];
  expiresAt?: string;
  onClaim: () => Promise<boolean>;
  onDismiss: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0h 0m';
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h >= 1) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * One-time first-time-user offer modal. Higher-value bundle + exclusive
 * cosmetic with a live countdown. Purchase is delegated to onClaim (RevenueCat
 * lives in the parent); the offer can never gate gameplay.
 */
export default function FirstTimeOfferModal({
  visible,
  offer,
  expiresAt,
  onClaim,
  onDismiss,
}: FirstTimeOfferModalProps) {
  const colors = useThemedColors();
  const [purchasing, setPurchasing] = useState(false);
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!visible || !expiresAt) return;
    const tick = () => {
      setRemaining(formatRemaining(new Date(expiresAt).getTime() - Date.now()));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible, expiresAt]);

  if (!offer) return null;

  const handleClaim = async () => {
    setPurchasing(true);
    try {
      const ok = await onClaim();
      if (ok) onDismiss();
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
          <View style={[styles.ribbon, { backgroundColor: colors.primary }]}>
            <Text style={styles.ribbonText}>ONE-TIME OFFER</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{offer.title}</Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {offer.description}
          </Text>

          <View style={styles.rewards}>
            <View style={[styles.rewardPill, { backgroundColor: colors.backgroundTertiary }]}>
              <Text style={[styles.rewardValue, { color: colors.primary }]}>
                {offer.credits}
              </Text>
              <Text style={[styles.rewardLabel, { color: colors.textSecondary }]}>credits</Text>
            </View>
            {offer.exclusive_cosmetic_slug ? (
              <View style={[styles.rewardPill, { backgroundColor: colors.backgroundTertiary }]}>
                <Ionicons name="star" size={26} color={colors.warning} />
                <Text style={[styles.rewardLabel, { color: colors.textSecondary }]}>
                  exclusive cosmetic
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.priceRow}>
            {offer.reference_price_usd ? (
              <Text style={[styles.refPrice, { color: colors.textTertiary }]}>
                ${offer.reference_price_usd.toFixed(2)}
              </Text>
            ) : null}
            {offer.price_usd != null ? (
              <Text style={[styles.price, { color: colors.text }]}>
                ${offer.price_usd.toFixed(2)}
              </Text>
            ) : null}
          </View>

          {remaining ? (
            <Text style={[styles.countdown, { color: colors.error }]}>
              Ends in {remaining}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.claimButton, { backgroundColor: colors.primary }]}
            onPress={handleClaim}
            disabled={purchasing}
            accessibilityRole="button"
            accessibilityLabel="Claim one-time offer"
          >
            {purchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.claimText}>Claim Offer</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onDismiss}
            disabled={purchasing}
            accessibilityRole="button"
            accessibilityLabel="Dismiss offer"
          >
            <Text style={[styles.dismissText, { color: colors.textSecondary }]}>
              Maybe later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    marginBottom: Spacing.md,
  },
  claimText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  dismissText: {
    fontSize: Typography.sizes.sm,
    paddingVertical: Spacing.xs,
  },
});
