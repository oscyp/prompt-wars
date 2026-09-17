import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import BrandMark from './BrandMark';

export interface GameMastheadProps {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  avatar?: React.ReactNode;
  centered?: boolean;
}

/** Slot layout only. The opener, wallet and fighter retain their own behavior. */
export function GameMasthead({
  leading,
  trailing,
  avatar,
  centered = false,
}: GameMastheadProps) {
  const { width, fontScale } = useWindowDimensions();
  const expanded = fontScale > 1.15 || width < 360;
  const identity = <BrandMark size={centered ? 140 : 190} />;
  return (
    <View style={styles.root}>
      {expanded && centered && <View style={styles.brand}>{identity}</View>}
      <View style={styles.row}>
        {leading ? (
          <View style={[styles.side, centered && !expanded && styles.balanced]}>
            {leading}
          </View>
        ) : (
          !centered && <View style={styles.logo}>{identity}</View>
        )}
        {centered && !expanded && <View style={styles.logo}>{identity}</View>}
        <View
          style={[
            styles.side,
            styles.trailing,
            centered && !expanded && styles.balanced,
          ]}
        >
          {trailing}
          {avatar}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: 8, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  side: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  trailing: { justifyContent: 'flex-end' },
  balanced: { flexBasis: 0, flexGrow: 1 },
  logo: { flexShrink: 1, minWidth: 80 },
  brand: { alignItems: 'center' },
});
