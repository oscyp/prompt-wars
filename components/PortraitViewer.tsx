import React from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import BottomSheet from '@/components/sheets/BottomSheet';
import { GameButton } from '@/components/game';

export interface PortraitViewerProps {
  visible: boolean;
  returnFocusRef?: React.RefObject<View | null>;
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

/** The artwork scrolls independently from the persistent restore/close actions. */
export default function PortraitViewer({
  visible,
  returnFocusRef,
  uri,
  caption,
  onClose,
  footerAction,
  aspect = 1.5,
  onImageError,
}: PortraitViewerProps) {
  const { width, height } = useWindowDimensions();
  const frameW = Math.max(48, Math.min(width - 48, (height * 0.66) / aspect));
  return (
    <BottomSheet
      returnFocusRef={returnFocusRef}
      visible={visible && !!uri}
      onClose={onClose}
      title={caption}
      dismissDisabled={!!footerAction?.busy}
      closeAccessibilityLabel="Close full-screen portrait"
      footer={
        <View style={{ gap: 12 }}>
          {footerAction && (
            <GameButton
              label={footerAction.label}
              onPress={footerAction.onPress}
              busy={footerAction.busy}
              disabled={footerAction.disabled}
            />
          )}
          <GameButton
            label="Close"
            onPress={onClose}
            disabled={footerAction?.busy}
            tone="secondary"
          />
        </View>
      }
    >
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        {uri && (
          <Image
            source={{ uri }}
            style={{ width: frameW, height: frameW * aspect }}
            resizeMode="contain"
            onError={onImageError}
            accessibilityLabel={caption ?? 'Character portrait'}
          />
        )}
      </View>
    </BottomSheet>
  );
}
