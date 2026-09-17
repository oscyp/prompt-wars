import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { useThemedColors } from '@/hooks/useThemedColors';

export interface GameScreenProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  safeTop?: boolean;
  safeBottom?: boolean;
  testID?: string;
}

/** Disable an edge when a navigator or keyboard-aware parent already owns it. */
export function GameScreen({
  children,
  footer,
  scroll = true,
  contentContainerStyle,
  style,
  safeTop = true,
  safeBottom = true,
  testID,
}: GameScreenProps) {
  const colors = useThemedColors();
  const edges: Edge[] = [
    'left',
    'right',
    ...(safeTop ? ['top' as const] : []),
    ...(safeBottom ? ['bottom' as const] : []),
  ];
  return (
    <SafeAreaView
      testID={testID}
      edges={edges}
      style={[styles.screen, { backgroundColor: colors.background }, style]}
    >
      {scroll ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="never"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, styles.content, contentContainerStyle]}>
          {children}
        </View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  content: { flexGrow: 1, padding: 16, gap: 16 },
});
