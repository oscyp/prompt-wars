import React, { useEffect, useRef } from 'react';
import {
  View,
  Image,
  Text,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

interface PortraitPreviewProps {
  uri: string;
  size?: number;
  loading?: boolean;
  caption?: string;
  accessibilityLabel?: string;
}

export default function PortraitPreview({
  uri,
  size = 240,
  loading = false,
  caption,
  accessibilityLabel = 'Character portrait',
}: PortraitPreviewProps) {
  const colors = useThemedColors();
  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!loading) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [loading, pulse]);

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: colors.primary,
            opacity: pulse,
          },
        ]}
      >
        <Image
          source={{ uri }}
          style={{
            width: size - 8,
            height: size - 8,
            borderRadius: (size - 8) / 2,
          }}
          accessibilityLabel={accessibilityLabel}
        />
        {loading ? (
          <View style={styles.spinnerOverlay}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : null}
      </Animated.View>
      {caption ? (
        <Text
          style={[styles.caption, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    overflow: 'hidden',
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: BorderRadius.full,
  },
  caption: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
});
