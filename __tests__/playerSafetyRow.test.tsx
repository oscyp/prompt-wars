import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, within } from '@testing-library/react-native';
import { PlayerSafetyRow } from '@/components/PlayerSafetyActions';

jest.mock('@/components/ReportBlockSheet', () => {
  const { Text } = require('react-native');
  return ({ visible, reportedId }: { visible: boolean; reportedId: string }) =>
    visible ? <Text>{`Safety for ${reportedId}`}</Text> : null;
});

it('opens safety independently of navigation and retains the target after reflow', () => {
  const navigate = jest.fn();
  const view = render(
    <PlayerSafetyRow profileId="fighter-one" name="Żaneta">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open battle"
        onPress={navigate}
      >
        <Text>Battle</Text>
      </Pressable>
    </PlayerSafetyRow>,
  );
  fireEvent.press(view.getByRole('button', { name: 'Report or block Żaneta' }));
  expect(navigate).not.toHaveBeenCalled();
  expect(view.getByText('Safety for fighter-one')).toBeTruthy();
  const row = view
    .UNSAFE_getAllByType(View)
    .find((node) => node.props.onLayout);
  fireEvent(row!, 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  fireEvent.press(view.getByRole('button', { name: 'Open battle' }));
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('does not offer player reporting for a bot row', () => {
  const view = render(
    <PlayerSafetyRow name="Practice bot">
      <Text>Practice</Text>
    </PlayerSafetyRow>,
  );
  expect(view.queryByRole('button')).toBeNull();
});

it('keeps navigation and Safety inside one full-width frame for human and bot rows', () => {
  const view = render(
    <PlayerSafetyRow framed profileId="opponent" name="Mira">
      <Pressable accessibilityRole="button" accessibilityLabel="Open battle">
        <Text>Battle</Text>
      </Pressable>
    </PlayerSafetyRow>,
  );
  const frame = view.getByTestId('player-row-frame');
  expect(
    within(frame).getByRole('button', { name: 'Open battle' }),
  ).toBeTruthy();
  expect(
    within(frame).getByRole('button', { name: 'Report or block Mira' }),
  ).toBeTruthy();
  expect(view.getByTestId('player-row-navigation')).toHaveStyle({
    width: '100%',
  });
  view.rerender(
    <PlayerSafetyRow framed name="Echo">
      <Text>Bot</Text>
    </PlayerSafetyRow>,
  );
  expect(view.getByTestId('player-row-navigation')).toHaveStyle({
    width: '100%',
  });
});
