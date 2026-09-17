import React from 'react';
import { StyleSheet, type TextStyle, type StyleProp } from 'react-native';
import { GameText as Text } from './game';
import { useAccessibleTextStyle } from '@/hooks/useAccessibleText';
import { Typography } from '@/constants/DesignTokens';
import type { TitlePresentation } from '@/constants/Cosmetics';

export interface CosmeticTitleProps {
  title: TitlePresentation | null | undefined;
  style?: StyleProp<TextStyle>;
}

/**
 * The player's equipped title, shown under their name.
 *
 * Renders nothing when no title is equipped, so every caller can drop it in
 * unconditionally rather than repeating the null check at seven call sites.
 */
export default function CosmeticTitle({ title, style }: CosmeticTitleProps) {
  const accessibleText = useAccessibleTextStyle();
  if (!title) return null;

  return (
    <Text
      variant="label"
      style={[styles.title, accessibleText, { color: title.color }, style]}
      accessibilityLabel={`Title: ${title.label}`}
    >
      {title.label}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    flexShrink: 1,
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
