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
  /** Fixed inside the safe area, above the scrolling body. */
  header?: React.ReactNode;
  /** Decorative full-screen layer, including the regions behind system bars. */
  background?: React.ReactNode;
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
  header,
  background,
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
    <View
      testID={testID}
      style={[styles.screen, { backgroundColor: colors.background }, style]}
    >
      {background && (
        <View
          testID="game-screen-background"
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={StyleSheet.absoluteFill}
        >
          {background}
        </View>
      )}
      <SafeAreaView edges={edges} style={styles.screen}>
        {header}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  content: { flexGrow: 1, padding: 16, gap: 16 },
});
