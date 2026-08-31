import React from 'react';
import {
  Modal,
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

export interface PortraitViewerProps {
  visible: boolean;
  uri: string | null;
  /** Shown under the image, e.g. the character's name. */
  caption?: string;
  onClose: () => void;
  /**
   * Width-to-height ratio of the source image. 1.5 (2:3) is the fighter render;
   * pass 1 for an avatar, which is square and would letterbox badly inside a
   * frame hardcoded to the fighter's shape.
   */
  aspect?: number;
  /**
   * The image failed to load — in practice, an expired signed URL. The caller
   * re-signs; without this the player just sees a broken frame and has nothing
   * to act on.
   */
  onImageError?: () => void;
  /**
   * Optional action rendered under the image, e.g. restoring an earlier render.
   *
   * The history strip used to restore on tap of a 46pt thumbnail, so judging a
   * render and committing to it were the same gesture. Previewing first and
   * acting from here separates them.
   */
  footerAction?: {
    label: string;
    onPress: () => void;
    busy?: boolean;
    disabled?: boolean;
  };
}

/**
 * Fullscreen look at a render.
 *
 * The edit screen shows the portrait at thumbnail scale while asking the player
 * to decide whether to pay for a different one. Judging a render at that size
 * is guesswork, and guessing wrong costs a credit.
 *
 * Deliberately single-theme: this is a cinematic surface, so it commits to a
 * near-black ground in both themes rather than following the viewer's scheme.
 */
export default function PortraitViewer({
  visible,
  uri,
  caption,
  onClose,
  footerAction,
  aspect = 1.5,
  onImageError,
}: PortraitViewerProps) {
  const { width, height } = useWindowDimensions();
  // Matches the source's own aspect, fitted to whichever axis binds.
  const maxW = width - Spacing.lg * 2;
  const maxH = height * 0.72;
  const frameW = Math.min(maxW, maxH / aspect);
  const frameH = frameW * aspect;

  return (
    <Modal
      visible={visible && !!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close full-screen portrait"
        />
        <View pointerEvents="box-none" style={styles.content}>
          {uri ? (
            <Image
              source={{ uri }}
              style={[styles.image, { width: frameW, height: frameH }]}
              resizeMode="contain"
              onError={onImageError}
              accessibilityLabel={caption ?? 'Character portrait'}
            />
          ) : null}
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
          {footerAction ? (
            <TouchableOpacity
              onPress={footerAction.onPress}
              disabled={footerAction.busy || footerAction.disabled}
              accessibilityRole="button"
              accessibilityLabel={footerAction.label}
              accessibilityState={{
                disabled: !!(footerAction.busy || footerAction.disabled),
              }}
              style={[
                styles.footerAction,
                (footerAction.busy || footerAction.disabled) &&
                  styles.footerDisabled,
              ]}
            >
              <Text style={styles.footerActionText}>
                {footerAction.busy ? 'Restoring…' : footerAction.label}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
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
  },
  content: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  image: {
    borderRadius: BorderRadius.lg,
  },
  caption: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: Typography.sizes.sm,
  },
  close: {
    position: 'absolute',
    top: -Spacing.xl,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  footerAction: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  footerDisabled: {
    opacity: 0.5,
  },
  footerActionText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
  },
});
