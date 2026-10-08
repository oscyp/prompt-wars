import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import Verdict from '@/components/battle/ResultVerdict';
import ResultMedia from '@/components/battle/ResultMedia';
import BattleHeader from '@/components/battle/BattleHeader';
import { roundImpactSides } from '@/components/battle/RoundImpact';
jest.mock('expo-font', () => ({
  isLoaded: jest.fn(() => false),
  loadAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('expo-video', () => ({ VideoView: 'VideoView' }));
it('labels practice cancellation explicitly and delegates to the existing confirmation', () => {
  const leave = jest.fn();
  const park = jest.fn();
  const ui = render(
    <BattleHeader onPark={park} onLeave={leave} leaveLabel="Leave" />,
  );
  fireEvent.press(ui.getByRole('button', { name: 'Battle options' }));
  fireEvent.press(ui.getByRole('button', { name: 'Cancel battle' }));
  expect(leave).toHaveBeenCalledTimes(1);
  expect(park).not.toHaveBeenCalled();
});
it('keeps parking available during judging and hides the destructive action until options opens', () => {
  const park = jest.fn();
  const leave = jest.fn();
  const ui = render(
    <BattleHeader
      onPark={park}
      onLeave={leave}
      leaveLabel="Forfeit"
      leaveDisabled
    />,
  );
  fireEvent.press(ui.getByRole('button', { name: 'Arena' }));
  expect(park).toHaveBeenCalledTimes(1);
  expect(ui.queryByRole('button', { name: 'Forfeit' })).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Battle options' }));
  fireEvent.press(ui.getByRole('button', { name: 'Forfeit' }));
  expect(leave).not.toHaveBeenCalled();
});
it.each([true, false])(
  'keeps received damage with its server seat when player one is %s',
  (isPlayerOne) => {
    const round = {
      player_one_hp_after: 75,
      player_two_hp_after: 60,
      player_one_damage: 25,
      player_two_damage: 40,
    };
    const sides = roundImpactSides(round, isPlayerOne);
    expect(sides.mine).toEqual(
      isPlayerOne ? { hp: 75, damage: 25 } : { hp: 60, damage: 40 },
    );
    expect(sides.theirs).toEqual(
      isPlayerOne ? { hp: 60, damage: 40 } : { hp: 75, damage: 25 },
    );
  },
);
it('does not invent HP or damage for legacy rounds', () => {
  expect(roundImpactSides({}, true)).toEqual({
    mine: { hp: undefined, damage: undefined },
    theirs: { hp: undefined, damage: undefined },
  });
});

it('exposes only the current no-contest verdict after review', () => {
  const ui = render(
    <Verdict
      outcome="no_contest"
      isKo
      scoreLine="2–0"
      adjudicationRevision={2}
      ratingLine="Original rating points reversed. No replacement rating."
    />,
  );
  expect(ui.getByText('No contest')).toBeTruthy();
  expect(ui.queryByText('KO')).toBeNull();
  expect(ui.queryByText('2–0')).toBeNull();
  expect(ui.getByText('Reviewed result · revision 2')).toBeTruthy();
  expect(
    ui.getByText('Original rating points reversed. No replacement rating.'),
  ).toBeTruthy();
});

it('keeps signing recovery separate from video purchasing', () => {
  const retry = jest.fn();
  const ui = render(
    <ResultMedia
      videoUrl={null}
      player={
        {
          addListener: () => ({ remove: () => {} }),
          pause: () => {},
        } as never
      }
      playbackError="signing failed"
      retry={retry}
      status={null}
      revised={false}
      roundNumber={null}
    />,
  );
  expect(ui.queryByText('Cinematic video')).toBeNull();
  fireEvent.press(ui.getByRole('button', { name: 'Retry loading media' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(ui.queryByText('Get the cinematic video')).toBeNull();
});
it('labels old cinematic playback explicitly after review', () => {
  const ui = render(
    <ResultMedia
      videoUrl="signed-approved-video"
      player={
        {
          addListener: () => ({ remove: () => {} }),
          pause: () => {},
        } as never
      }
      playbackError={null}
      retry={() => {}}
      status={null}
      revised
      roundNumber={null}
    />,
  );
  expect(ui.queryByText('Cinematic')).toBeNull();
  expect(ui.getByText('Before review')).toBeTruthy();
  expect(ui.queryByText('Captions')).toBeNull();
});

it('keeps header navigation quiet with visible Arena chevron and 48pt targets', () => {
  const ui = render(
    <BattleHeader onPark={() => {}} onLeave={() => {}} leaveLabel="Leave" />,
  );
  expect(ui.getByText('‹ Arena')).toBeTruthy();
  for (const name of ['Arena', 'Battle options']) {
    expect(
      StyleSheet.flatten(ui.getByRole('button', { name }).props.style),
    ).toMatchObject({ minHeight: 48 });
  }
  fireEvent.press(ui.getByRole('button', { name: 'Battle options' }));
  expect(ui.getByRole('button', { name: 'Cancel battle' })).toBeTruthy();
  expect(ui.queryByText('Forfeit / Cancel battle')).toBeNull();
});
