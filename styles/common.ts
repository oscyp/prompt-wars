/**
 * Shared styles for Prompt Wars
 * Common style utilities and theme helpers
 */

import { StyleSheet } from 'react-native';
import { Spacing, Typography } from '@/constants/DesignTokens';

export const commonStyles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Spacing
  padding: {
    padding: Spacing.md,
  },
  paddingLarge: {
    padding: Spacing.lg,
  },
  marginBottom: {
    marginBottom: Spacing.md,
  },
  marginBottomLarge: {
    marginBottom: Spacing.lg,
  },

  // Typography
  textCenter: {
    textAlign: 'center',
  },
  textBold: {
    fontWeight: Typography.weights.bold,
  },
  textSemibold: {
    fontWeight: Typography.weights.semibold,
  },

  // Accessibility
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
  },
});

/**
 * Dynamic type support utilities
 * Scales font sizes based on device accessibility settings
 */
export const getDynamicFontSize = (baseSize: number, scale: number = 1) => {
  return baseSize * scale;
};
