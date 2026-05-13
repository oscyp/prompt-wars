import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import GlowGradientButton from './GlowGradientButton';

interface LegacyButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Back-compat wrapper preserving the legacy Button API while routing to
 * the new GlowGradientButton. Prefer GlowGradientButton directly in new code.
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled = false,
  style,
}: LegacyButtonProps) {
  const mapped: 'primary' | 'ghost' | 'danger' =
    variant === 'primary' ? 'primary' : variant === 'danger' ? 'danger' : 'ghost';
  return (
    <GlowGradientButton
      title={title}
      onPress={onPress}
      variant={mapped}
      loading={loading}
      fullWidth={fullWidth}
      disabled={disabled}
      style={style}
    />
  );
}
