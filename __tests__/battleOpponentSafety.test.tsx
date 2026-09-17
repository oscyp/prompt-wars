import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BattleOpponentSafety from '@/components/BattleOpponentSafety';
jest.mock('@/components/ReportBlockSheet', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      visible,
      reportedProfileId,
    }: {
      visible: boolean;
      reportedProfileId: string;
    }) => (visible ? <Text>Safety for {reportedProfileId}</Text> : null),
  };
});
const battle = {
  player_one_id: 'me',
  player_two_id: 'them',
  is_player_two_bot: false,
};
test('human opponents have an independent action opening their safety sheet', () => {
  const view = render(
    <BattleOpponentSafety battle={battle} myId="me" name="Rival" />,
  );
  fireEvent.press(view.getByLabelText('Report or block Rival'));
  expect(view.getByText('Safety for them')).toBeTruthy();
});
test.each([
  { ...battle, is_player_two_bot: true },
  { ...battle, player_two_id: 'me' },
  { ...battle, player_two_id: null },
])('bots, self and absent opponents expose no human safety action', (row) => {
  const view = render(<BattleOpponentSafety battle={row} myId="me" />);
  expect(view.queryByRole('button')).toBeNull();
});
