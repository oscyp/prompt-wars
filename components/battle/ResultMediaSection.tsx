import React from 'react';
import { View } from 'react-native';

export default function ResultMediaSection({
  showMedia,
  media,
  actions,
  rewards,
}: {
  showMedia: boolean;
  media: React.ReactNode;
  actions: React.ReactNode;
  rewards: React.ReactNode;
}) {
  return (
    <View style={{ gap: 20 }}>
      {showMedia ? <View testID="result-section-media">{media}</View> : null}
      <View testID="result-section-actions">{actions}</View>
      {rewards ? <View testID="result-section-rewards">{rewards}</View> : null}
    </View>
  );
}
