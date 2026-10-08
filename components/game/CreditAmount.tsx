import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useThemedColors } from '@/hooks/useThemedColors';
import { GameIcon } from './icons/GameIcon';
import { GameText } from './GameText';

export interface CreditAmountProps {
  amount: number | null;
  signed?: boolean;
  size?: 'small' | 'regular' | 'large';
  color?: string;
  accessible?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function creditAmountLabel(amount: number | null, signed = false) {
  if (amount === null || !Number.isFinite(amount)) return 'Credits unavailable';
  const prefix =
    signed && amount !== 0 ? (amount < 0 ? 'Minus ' : 'Plus ') : '';
  return `${prefix}${Math.abs(amount).toLocaleString()} credits`;
}

/** One spoken amount; the diamond is decoration and never a second focus stop. */
export function CreditAmount({
  amount,
  signed = false,
  size = 'regular',
  color,
  accessible = true,
  style,
}: CreditAmountProps) {
  const colors = useThemedColors();
  const known = amount !== null && Number.isFinite(amount);
  const value = known
    ? `${amount! < 0 ? '−' : signed && amount! > 0 ? '+' : ''}${Math.abs(amount!).toLocaleString()}`
    : '—';
  const fontSize = size === 'large' ? 32 : size === 'small' ? 16 : 20;
  return (
    <View
      accessible={accessible}
      accessibilityLabel={
        accessible ? creditAmountLabel(amount, signed) : undefined
      }
      accessibilityElementsHidden={!accessible}
      importantForAccessibility={accessible ? 'yes' : 'no-hide-descendants'}
      style={[styles.amount, style]}
    >
      <GameIcon
        name="crystal"
        size={fontSize + 7}
        color={color ?? colors.primary}
        accent={color ? undefined : '#E8D9FF'}
      />
      <GameText
        accessible={false}
        variant="label"
        style={{
          fontSize,
          lineHeight: fontSize * 1.3,
          color: color ?? (known ? colors.text : colors.textSecondary),
          flexShrink: 1,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </GameText>
    </View>
  );
}

const styles = StyleSheet.create({
  amount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    maxWidth: '100%',
  },
});
