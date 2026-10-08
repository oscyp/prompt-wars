import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { GameChrome } from '@/constants/DesignTokens';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameBevel } from './GameBevel';

export interface GamePanelProps extends ViewProps {
  tone?: 'quiet' | 'ornate' | 'selected';
}

export function GamePanel({
  tone = 'quiet',
  style,
  children,
  accessibilityState,
  ...props
}: GamePanelProps) {
  const colors = useThemedColors();
  const selected = tone === 'selected';
  return (
    <View
      {...props}
      accessibilityState={{
        ...accessibilityState,
        ...(selected ? { selected: true } : {}),
      }}
      style={[styles.panel, style, styles.chromeOwner]}
    >
      <GameBevel
        color={
          selected || tone === 'ornate' ? colors.ornament : colors.ornamentMuted
        }
        fill={selected ? colors.selectedSurface : colors.card}
        insetColor={colors.ornamentMuted}
        strokeWidth={1.5}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chromeOwner: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
  },
  panel: { padding: GameChrome.panelPadding, position: 'relative' },
});
