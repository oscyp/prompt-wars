import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { environmentForTheme } from '@/constants/BattleEnvironmentArt';
export default function BattleBackdrop({
  theme,
  quiet = false,
}: {
  theme?: string | null;
  quiet?: boolean;
}) {
  return (
    <ImageBackground
      source={environmentForTheme(theme).backdrop}
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      imageStyle={{ width: '100%', height: '100%' }}
      resizeMode="cover"
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: quiet ? 'rgba(8,7,20,0.90)' : 'rgba(8,7,20,0.58)',
          },
        ]}
      />
    </ImageBackground>
  );
}
