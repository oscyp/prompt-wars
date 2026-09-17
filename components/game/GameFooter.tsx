import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';

export interface GameFooterProps extends ViewProps {
  keyboardVisible?: boolean;
}

/** No safe area or keyboard insets here: the screen owns those exactly once. */
export function GameFooter({
  keyboardVisible = false,
  children,
  style,
  ...props
}: GameFooterProps) {
  const colors = useThemedColors();
  return (
    <View
      {...props}
      style={[
        styles.footer,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.ornamentMuted,
        },
        keyboardVisible && styles.compact,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { padding: 16, gap: 12, borderTopWidth: 1, flexShrink: 0 },
  compact: { paddingVertical: 8 },
});
