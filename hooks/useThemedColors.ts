import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors, ColorStyle } from '@/constants/Colors';

/**
 * Hook to get current theme colors
 * Automatically switches between light and dark mode
 */
export function useThemedColors() {
  const colorScheme = useRNColorScheme() ?? 'light';
  return Colors[colorScheme as ColorStyle];
}
