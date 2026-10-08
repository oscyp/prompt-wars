import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { OpponentMoveHistory } from '@/components/battle/OpponentMoveHistory';
import { getOpponentMoveHistory } from '@/utils/battles';
jest.mock('@/utils/battles', () => ({ getOpponentMoveHistory: jest.fn() }));
jest.mock('expo-font', () => ({ isLoaded: () => true }));
it('hides bot/empty history and displays only resolved moves in chronological order on demand', async () => {
  jest.mocked(getOpponentMoveHistory).mockResolvedValue([]);
  const bot = render(
    <OpponentMoveHistory accountId="me" battleId="battle" isBot />,
  );
  expect(getOpponentMoveHistory).not.toHaveBeenCalled();
  expect(bot.toJSON()).toBeNull();
  bot.unmount();
  const empty = render(
    <OpponentMoveHistory accountId="me" battleId="battle" isBot={false} />,
  );
  await waitFor(() => expect(getOpponentMoveHistory).toHaveBeenCalled());
  expect(empty.toJSON()).toBeNull();
  empty.unmount();
  jest
    .mocked(getOpponentMoveHistory)
    .mockResolvedValue([
      { move_type: 'attack' },
      { move_type: 'defense' },
      { move_type: 'finisher' },
    ]);
  const screen = render(
    <OpponentMoveHistory accountId="me" battleId="battle" isBot={false} />,
  );
  const button = await screen.findByRole('button', {
    name: 'Opponent’s recent moves',
  });
  expect(screen.queryByText(/oldest to newest/)).toBeNull();
  fireEvent.press(button);
  expect(
    screen.getByText(
      'Resolved moves, oldest to newest: Attack → Defense → Finisher.',
    ),
  ).toBeTruthy();
});
