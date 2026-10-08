import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TransactionRow from '@/components/wallet/TransactionRow';

const transaction = {
  id: 'purchase-one',
  reason: 'video_upgrade',
  amount: -3,
  created_at: '2026-09-22T12:00:00Z',
  battle_id: 'battle-one',
};
it('keeps the signed amount and only linked transactions navigate', () => {
  const open = jest.fn();
  const view = render(
    <TransactionRow transaction={transaction} onOpenBattle={open} />,
  );
  expect(view.getByText('−3', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(view.getByRole('button'));
  expect(open).toHaveBeenCalledWith('/(battle)/result?battleId=battle-one');
  view.rerender(
    <TransactionRow
      transaction={{ ...transaction, battle_id: null, amount: 5 }}
      onOpenBattle={open}
    />,
  );
  expect(view.getByText('+5', { includeHiddenElements: true })).toBeTruthy();
  expect(view.queryByRole('button')).toBeNull();
});
