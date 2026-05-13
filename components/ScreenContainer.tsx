import React from 'react';
import { ScrollView, ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemedColors } from '@/hooks/useThemedColors';
import { Spacing } from '@/constants/DesignTokens';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  /** Optional gradient backdrop (full-bleed). */
  gradient?: readonly [string, string] | readonly [string, string, string];
  /** Adds horizontal padding using Spacing.lg by default. */
  padded?: boolean;
}

/**
 * Standard screen wrapper: safe-area, themed background, optional gradient backdrop,
 * optional scroll. Use this on every top-level screen so chrome stays consistent.
 */
export default function ScreenContainer({
  children,
  scroll = false,
  refreshControl,
  contentContainerStyle,
  style,
  edges = ['top'],
  gradient,
  padded = true,
}: ScreenContainerProps) {
  const colors = useThemedColors();

  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[
        padded && styles.padded,
        styles.scrollContent,
        contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.padded, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }, style]}>
      {gradient && (
        <LinearGradient
          colors={gradient as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <SafeAreaView edges={edges} style={styles.safeArea}>
        {inner}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: Spacing.lg,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
});
