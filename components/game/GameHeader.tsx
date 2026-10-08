import React from 'react';
import { View, ViewProps, StyleSheet, useWindowDimensions } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameText } from './GameText';
import { GameDisplayTitle } from './GameDisplayTitle';

export interface GameHeaderProps extends ViewProps {
  title?: string;
  titleContent?: React.ReactNode;
  presentation?: 'hero' | 'tab' | 'secondary' | 'battle';
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function GameHeader({
  title,
  titleContent,
  presentation = 'hero',
  subtitle,
  leading,
  trailing,
  style,
  ...props
}: GameHeaderProps) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const separateControls = fontScale > 1.3 && Boolean(leading && trailing);
  if (presentation !== 'hero') {
    return (
      <View
        {...props}
        style={[
          styles.compact,
          separateControls && styles.stackedHeader,
          style,
        ]}
      >
        {separateControls ? (
          <View style={styles.controlRow}>
            <View style={styles.control}>{leading}</View>
            <View style={styles.control}>{trailing}</View>
          </View>
        ) : leading ? (
          <View style={styles.control}>{leading}</View>
        ) : null}
        <View style={separateControls ? styles.fullTitle : styles.compactTitle}>
          {titleContent ??
            (title ? (
              <GameDisplayTitle style={styles.titleLeft}>
                {title}
              </GameDisplayTitle>
            ) : null)}
          {subtitle && (
            <GameText variant="caption" style={{ color: colors.textSecondary }}>
              {subtitle}
            </GameText>
          )}
        </View>
        {!separateControls && trailing && (
          <View style={styles.control}>{trailing}</View>
        )}
      </View>
    );
  }
  return (
    <View {...props} style={[styles.header, style]}>
      {(leading || trailing) && (
        <View style={styles.actions}>
          <View style={styles.leading}>{leading}</View>
          <View style={styles.trailing}>{trailing}</View>
        </View>
      )}
      {titleContent ??
        (title ? (
          <GameDisplayTitle accessibilityRole="header" style={styles.title}>
            {title}
          </GameDisplayTitle>
        ) : null)}
      {subtitle && (
        <View style={styles.subtitle}>
          <View
            style={[styles.rule, { backgroundColor: colors.ornamentMuted }]}
          />
          <GameText
            variant="caption"
            style={[styles.subtitleText, { color: colors.textSecondary }]}
          >
            {subtitle}
          </GameText>
          <View
            style={[styles.rule, { backgroundColor: colors.ornamentMuted }]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  compactTitle: { flex: 1, flexBasis: 140, minWidth: 100 },
  stackedHeader: { flexDirection: 'column', alignItems: 'stretch' },
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fullTitle: { width: '100%' },
  titleLeft: { textAlign: 'left', fontSize: 32, lineHeight: 38 },
  control: { flexShrink: 1, maxWidth: '100%' },
  header: { gap: 10, paddingVertical: 16 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  leading: { flexGrow: 1, flexShrink: 1 },
  trailing: { flexShrink: 1 },
  title: { textAlign: 'center' },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  subtitleText: { textAlign: 'center', flexShrink: 1 },
  rule: { height: 1, flex: 1, maxWidth: 56 },
});
