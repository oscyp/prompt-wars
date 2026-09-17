import React from 'react';
import { Image, type StyleProp, type ImageStyle } from 'react-native';

export default function BrandMark({
  kind = 'wordmark',
  size = 180,
  style,
}: {
  kind?: 'wordmark' | 'emblem';
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={
        kind === 'wordmark'
          ? require('../../assets/branding/wordmark.png')
          : require('../../assets/branding/crossed-quills.png')
      }
      resizeMode="contain"
      accessibilityLabel={kind === 'wordmark' ? 'Prompt Wars' : undefined}
      accessible={kind === 'wordmark'}
      style={[
        {
          width: size,
          height: kind === 'wordmark' ? size / 3 : size,
          maxWidth: '100%',
        },
        style,
      ]}
    />
  );
}
