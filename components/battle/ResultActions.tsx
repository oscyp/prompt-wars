import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { GameButton, GameText } from '@/components/game';

export function resultActionsHorizontal(width: number, fontScale: number) {
  return width >= 390 && fontScale <= 1.15;
}

export default function ResultActions({
  videoPlayable,
  revised,
  busy,
  onShareCard,
  onShareVideo,
  onReplay,
}: {
  videoPlayable: boolean;
  revised: boolean;
  busy: boolean;
  onShareCard: () => void;
  onShareVideo: () => void;
  onReplay: () => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const horizontal = resultActionsHorizontal(width, fontScale);
  return (
    <View style={{ gap: 12 }}>
      <View
        testID="share-actions"
        style={{ flexDirection: horizontal ? 'row' : 'column', gap: 12 }}
      >
        <GameButton
          style={horizontal ? { flex: 1 } : undefined}
          label="Share card"
          icon="share-outline"
          tone="secondary"
          chrome="utility"
          busy={busy}
          onPress={onShareCard}
        />
        {videoPlayable ? (
          <GameButton
            style={horizontal ? { flex: 1 } : undefined}
            label="Share video"
            icon="film-outline"
            tone="secondary"
            chrome="utility"
            busy={busy}
            unavailable={revised}
            unavailableHint={
              revised
                ? 'This cinematic records the verdict before review and cannot be shared.'
                : undefined
            }
            onPress={onShareVideo}
          />
        ) : null}
      </View>
      {videoPlayable && revised ? (
        <GameText variant="caption">Sharing unavailable</GameText>
      ) : null}
      <GameButton
        label="Replay reveal"
        icon="play-outline"
        tone="secondary"
        chrome="utility"
        onPress={onReplay}
      />
    </View>
  );
}
