import { StyleSheet } from 'react-native';
import { Spacing, Typography, BorderRadius } from '@/constants/DesignTokens';

/**
 * Common shared styles used across the app
 * Import and extend these for consistency
 */
export const commonStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  padding: {
    padding: Spacing.md,
  },
  paddingHorizontal: {
    paddingHorizontal: Spacing.md,
  },
  paddingVertical: {
    paddingVertical: Spacing.md,
  },
  card: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  buttonPrimary: {
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonText: {
    fontSize: Typography.sizes.base,
    fontWeight: Typography.weights.semibold,
  },
  input: {
    height: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.sizes.base,
  },
  shadowLight: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  shadowMedium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
});
