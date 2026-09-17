import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameText } from './GameText';
import { GameDisplayTitle } from './GameDisplayTitle';

export interface GameHeaderProps extends ViewProps {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function GameHeader({
  title,
  subtitle,
  leading,
  trailing,
  style,
  ...props
}: GameHeaderProps) {
  const colors = useThemedColors();
  return (
    <View {...props} style={[styles.header, style]}>
      {(leading || trailing) && (
        <View style={styles.actions}>
          <View style={styles.leading}>{leading}</View>
          <View style={styles.trailing}>{trailing}</View>
        </View>
      )}
      <GameDisplayTitle accessibilityRole="header" style={styles.title}>
        {title}
      </GameDisplayTitle>
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
