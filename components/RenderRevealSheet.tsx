import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';
import { formatCredits } from '@/utils/credits';
import { hapticSuccess } from '@/utils/haptics';
import { avatarPendingCopy } from '@/utils/editDialogCopy';
import PortraitPreview from './PortraitPreview';
import InlineBanner from './InlineBanner';

export type RevealAvatar =
  | { status: 'ready'; uri: string }
  /** The avatar leg is still running, or the server is too old to say yet. */
  | { status: 'pending' }
  /** The fighter landed, the avatar did not. */
  | { status: 'failed' };

export interface RenderRevealSheetProps {
  visible: boolean;
  characterName: string;
  accentColor: string;
  fighterUri: string | null;
  avatar: RevealAvatar;
  mode: 'render' | 'random';
  creditsSpent: number;
  /** Offer the free retry only when the deployed server supports it. */
  canRetryAvatar: boolean;
  retryingAvatar?: boolean;
  /** False on a first render, or when the previous ids are unknown. */
  canRestorePrevious: boolean;
  restoring?: boolean;
  onKeep: () => void;
  onRestorePrevious: () => void;
  onRetryAvatar: () => void;
  /** Expired signed URL; the caller re-signs. */
  onImageError?: () => void;
}

const AVATAR_SIZE = 96;
const FULL_BODY_ASPECT = 1.5;

/**
 * The moment after paying for a render.
 *
 * The screen used to swap the thumbnail and fire a toast, so a three-credit
 * purchase landed as a 64pt change nobody was looking at. This shows the new
 * fighter and avatar large, with a haptic on landing, and turns regret into a
 * choice: keep it, or restore the previous pair for free.
 *
 * Fixed near-black surface, like PortraitViewer — a cinematic zone.
 */
export default function RenderRevealSheet({
  visible,
  characterName,
  accentColor,
  fighterUri,
  avatar,
  mode,
  creditsSpent,
  canRetryAvatar,
  retryingAvatar = false,
  canRestorePrevious,
  restoring = false,
  onKeep,
  onRestorePrevious,
  onRetryAvatar,
  onImageError,
}: RenderRevealSheetProps) {
  const colors = useThemedColors();
  const reduceMotion = useReducedMotion();
  const accessibleText = useAccessibleTextStyle();
  const { width, height } = useWindowDimensions();

  const fighterY = useRef(new Animated.Value(80)).current;
  const fighterScale = useRef(new Animated.Value(0.92)).current;
  const avatarScale = useRef(new Animated.Value(0.6)).current;
  const avatarOpacity = useRef(new Animated.Value(0)).current;
  const playedRef = useRef(false);

  // Two-stage landing (FaceOffPortraits' clash): the fighter springs in, the
  // haptic fires on the hit, then the avatar pops beside it. Reduce Motion goes
  // straight to the resting frame and still gets the one haptic.
  useEffect(() => {
    if (!visible) {
      playedRef.current = false;
      return;
    }
    if (playedRef.current) return;
    playedRef.current = true;

    if (reduceMotion) {
      fighterY.setValue(0);
      fighterScale.setValue(1);
      avatarScale.setValue(1);
      avatarOpacity.setValue(1);
      hapticSuccess();
      return;
    }

    fighterY.setValue(80);
    fighterScale.setValue(0.92);
    avatarScale.setValue(0.6);
    avatarOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(fighterY, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.spring(fighterScale, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start(() => {
      hapticSuccess();
      Animated.parallel([
        Animated.spring(avatarScale, {
          toValue: 1,
          friction: 5,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.timing(avatarOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [
    visible,
    reduceMotion,
    fighterY,
    fighterScale,
    avatarScale,
    avatarOpacity,
  ]);

  const maxW = width - Spacing.lg * 2 - AVATAR_SIZE / 2;
  const maxH = height * 0.52;
  const frameW = Math.max(120, Math.min(maxW, maxH / FULL_BODY_ASPECT));

  const effectiveAvatar: RevealAvatar = retryingAvatar
    ? { status: 'pending' }
    : avatar;
  const pendingCopy = avatarPendingCopy(canRetryAvatar);

  const spent =
    creditsSpent > 0
      ? ` · ${formatCredits(creditsSpent, 'sentence')} spent`
      : '';
  const caption = `${characterName} · ${
    mode === 'random' ? 'New character' : 'New look'
  }${spent}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onKeep}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onKeep}
          accessibilityRole="button"
          accessibilityLabel="Keep the new look and close"
        />
        <View pointerEvents="box-none" style={styles.content}>
          <Text
            accessibilityRole="header"
            style={[styles.heading, accessibleText]}
          >
            {mode === 'random' ? 'Your new character' : 'Your new look'}
          </Text>

          <View style={{ width: frameW + AVATAR_SIZE / 2 }}>
            <Animated.View
              style={{
                transform: [{ translateY: fighterY }, { scale: fighterScale }],
              }}
            >
              {fighterUri ? (
                <PortraitPreview
                  uri={fighterUri}
                  variant="fullBody"
                  size={frameW}
                  accentColor={accentColor}
                  accessibilityLabel={`${characterName}, new portrait`}
                />
              ) : (
                <View
                  style={[
                    styles.missing,
                    {
                      width: frameW,
                      height: Math.round(frameW * FULL_BODY_ASPECT),
                      borderColor: accentColor,
                    },
                  ]}
                >
                  <Ionicons name="image-outline" size={40} color="#FFFFFF" />
                </View>
              )}
            </Animated.View>

            <Animated.View
              style={[
                styles.avatarSlot,
                { transform: [{ scale: avatarScale }], opacity: avatarOpacity },
              ]}
              accessible
              accessibilityLabel={
                effectiveAvatar.status === 'ready'
                  ? `${characterName}, new avatar`
                  : effectiveAvatar.status === 'pending'
                    ? 'Avatar still drawing'
                    : 'Avatar did not render'
              }
            >
              {effectiveAvatar.status === 'ready' ? (
                <PortraitPreview
                  uri={effectiveAvatar.uri}
                  variant="circle"
                  size={AVATAR_SIZE}
                  accentColor={accentColor}
                  accessibilityLabel={undefined}
                />
              ) : effectiveAvatar.status === 'pending' ? (
                <PortraitPreview
                  uri={fighterUri ?? ''}
                  variant="circle"
                  size={AVATAR_SIZE}
                  accentColor={accentColor}
                  loading
                  accessibilityLabel={undefined}
                />
              ) : (
                <View
                  style={[styles.avatarFailed, { borderColor: accentColor }]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={32}
                    color="#FFFFFF"
                  />
                </View>
              )}
            </Animated.View>
          </View>

          {/* No AI-generated pill: the in-app disclosure was removed as a
              product decision (commit 042c59a). Restore here first if store
              review asks for it. */}
          <View style={styles.captionRow}>
            <Text style={[styles.caption, accessibleText]} numberOfLines={2}>
              {caption}
            </Text>
          </View>

          {effectiveAvatar.status === 'failed' ? (
            <View style={styles.banner}>
              <InlineBanner
                tone="warning"
                text={pendingCopy.text}
                actionLabel={
                  canRetryAvatar ? pendingCopy.actionLabel : undefined
                }
                onAction={canRetryAvatar ? onRetryAvatar : undefined}
              />
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onKeep}
              disabled={restoring}
              accessibilityRole="button"
              accessibilityLabel="Keep"
              accessibilityState={{ disabled: restoring }}
              style={[
                styles.keep,
                {
                  backgroundColor: colors.primary,
                  opacity: restoring ? 0.6 : 1,
                },
              ]}
            >
              <Text style={styles.keepText}>Keep</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRestorePrevious}
              disabled={!canRestorePrevious || restoring}
              accessibilityRole="button"
              accessibilityLabel="Restore previous, free"
              accessibilityState={{
                disabled: !canRestorePrevious || restoring,
                busy: restoring,
              }}
              style={[
                styles.restore,
                (!canRestorePrevious || restoring) && styles.disabled,
              ]}
            >
              <Text style={styles.restoreText}>
                {restoring ? 'Restoring…' : 'Restore previous · Free'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {onImageError ? null : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,6,9,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  heading: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    textAlign: 'center',
  },
  missing: {
    borderWidth: 3,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  avatarSlot: {
    position: 'absolute',
    right: 0,
    bottom: -Spacing.md,
  },
  avatarFailed: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  captionRow: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  caption: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  banner: { alignSelf: 'stretch' },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  keep: {
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  restore: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  restoreText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
  disabled: { opacity: 0.5 },
});
