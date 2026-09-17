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
      style={[styles.panel, style]}
    >
      <GameBevel
        color={
          selected
            ? colors.primary
            : tone === 'ornate'
              ? colors.ornament
              : colors.border
        }
        fill={selected ? colors.selectedSurface : colors.card}
        insetColor={tone === 'ornate' ? colors.ornamentMuted : undefined}
        strokeWidth={selected ? 2 : 1}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: GameChrome.panelPadding, position: 'relative' },
});
