import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import type { Href } from 'expo-router';
import { CreditAmount, GameIcon, GameText } from '@/components/game';
import { useThemedColors } from '@/hooks/useThemedColors';
import { transactionAmountLabel, transactionLabel } from '@/utils/walletCopy';
import { shortDate } from '@/utils/walletView';

export interface WalletTransaction {
  id: string;
  reason: string | null;
  amount: number;
  created_at: string;
  battle_id?: string | null;
}

/** Presentation only: opening an existing battle never replays its purchase. */
export default function TransactionRow({
  transaction: tx,
  onOpenBattle,
}: {
  transaction: WalletTransaction;
  onOpenBattle: (route: Href) => void;
}) {
  const colors = useThemedColors();
  const { fontScale } = useWindowDimensions();
  const label = transactionLabel(tx.reason);
  const date = shortDate(tx.created_at) ?? '';
  const route: Href | null = tx.battle_id
    ? `/(battle)/result?battleId=${tx.battle_id}`
    : null;
  const summary = `${label}, ${transactionAmountLabel(tx.amount)}, ${date}`;
  const row = (
    <>
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          flex: 1,
          minWidth: 120,
          alignItems: 'center',
        }}
      >
        <GameIcon
          name={tx.battle_id ? 'battle' : tx.amount > 0 ? 'crystal' : 'wallet'}
          color={colors.ornament}
          size={24}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <GameText variant="label" style={{ color: colors.text }}>
            {label}
          </GameText>
          <GameText variant="caption" style={{ color: colors.textSecondary }}>
            {date}
          </GameText>
        </View>
      </View>
      <CreditAmount
        amount={tx.amount}
        signed
        color={tx.amount > 0 ? colors.success : colors.primary}
        accessible={false}
      />
      {route && (
        <GameIcon name="chevron-right" size={18} color={colors.ornament} />
      )}
    </>
  );
  const style = {
    minHeight: 64,
    flexDirection: fontScale > 1.3 ? ('column' as const) : ('row' as const),
    flexWrap: 'wrap' as const,
    alignItems: fontScale > 1.3 ? ('flex-start' as const) : ('center' as const),
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.ornamentMuted,
  };
  return route ? (
    <Pressable
      style={style}
      accessibilityRole="button"
      accessibilityLabel={`${summary}. Opens the battle result`}
      onPress={() => onOpenBattle(route)}
    >
      {row}
    </Pressable>
  ) : (
    <View style={style} accessible accessibilityLabel={summary}>
      {row}
    </View>
  );
}
