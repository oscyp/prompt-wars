import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { BattleMovePicker } from '@/components/game/battle/BattleMovePicker';
import { BattleThemePlaque } from '@/components/game/battle/BattleThemePlaque';
import VersusStrip from '@/components/VersusStrip';
import MoveTypeSelector from '@/components/MoveTypeSelector';
import SeriesScoreIndicator from '@/components/SeriesScoreIndicator';

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => true) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/utils/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticWarning: jest.fn(),
}));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

beforeEach(() =>
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 }),
);

test.each([
  [390, 1, 'row'],
  [369, 1, 'column'],
  [430, 1.2, 'column'],
] as const)(
  'move choices adapt at width %s and scale %s without changing selection',
  (width, fontScale, direction) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, fontScale, height: 844, scale: 3 });
    const onChange = jest.fn();
    const screen = render(
      <BattleMovePicker value="defense" onChange={onChange} />,
    );
    expect(
      StyleSheet.flatten(screen.getByTestId('battle-move-options').props.style)
        .flexDirection,
    ).toBe(direction);
    expect(
      screen.getByRole('radio', { name: 'Defense. Beats Attack' }).props
        .accessibilityState.checked,
    ).toBe(true);
    fireEvent.press(
      screen.getByRole('radio', { name: 'Finisher. Beats Defense' }),
    );
    expect(onChange).toHaveBeenCalledWith('finisher');
  },
);

test('counter guidance retains its supplied meaning and selection action', () => {
  const onChange = jest.fn();
  const screen = render(
    <MoveTypeSelector
      value="attack"
      suggestedCounter="defense"
      onChange={onChange}
    />,
  );
  const counter = screen.getByLabelText(
    'Select defense move, counters opponent pattern',
  );
  expect(counter.props.accessibilityHint).toBe(
    'Beats attack, loses to finisher',
  );
  fireEvent.press(counter);
  expect(onChange).toHaveBeenCalledWith('defense');
});

test('theme remains native and untruncated when the keyboard presentation collapses', () => {
  const theme = 'The final library beyond the forgotten mountains';
  const screen = render(<BattleThemePlaque theme={theme} />);
  expect(screen.getByRole('header').props.children).toBe(theme);
  screen.rerender(<BattleThemePlaque theme={theme} compact />);
  expect(screen.getByRole('header').props.children).toBe(theme);
  expect(screen.getByRole('header').props.numberOfLines).toBeUndefined();
});

test('matchup keeps full identity, readable HP and portrait actions', () => {
  const open = jest.fn();
  const screen = render(
    <VersusStrip
      left={{
        name: 'Mira of the Faraway Library',
        archetype: 'mystic',
        signatureColor: '#CCAAFF',
        hp: 72,
        hpMax: 100,
        portraitUrl: 'https://example.test/avatar.png',
        onAvatarPress: open,
      }}
      right={{
        name: 'Rook',
        archetype: 'warrior',
        signatureColor: '#FF9977',
        label: 'AI OPPONENT · PRACTICE',
        hp: 38,
        hpMax: 100,
      }}
    />,
  );
  fireEvent.press(
    screen.getByRole('button', {
      name: "View Mira of the Faraway Library's portrait",
    }),
  );
  expect(open).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('progressbar', {
      name: 'Mira of the Faraway Library: 72 HP out of 100',
    }).props.accessibilityValue.now,
  ).toBe(72);
  expect(screen.getByText('AI OPPONENT · PRACTICE')).toBeTruthy();
  expect(
    screen.getByText('Mira of the Faraway Library').props.numberOfLines,
  ).toBeUndefined();
});

test('series score is oriented for player two and absent for legacy single battles', () => {
  const screen = render(
    <SeriesScoreIndicator
      score={{ p1: 1, p2: 2 }}
      currentRound={3}
      format="bo3"
      viewer="p2"
    />,
  );
  expect(
    screen.getByLabelText('Series: you 2, opponent 1. Round 3 of 3.'),
  ).toBeTruthy();
  screen.rerender(
    <SeriesScoreIndicator
      score={{ p1: 1, p2: 2 }}
      currentRound={1}
      format="single"
      viewer="p2"
    />,
  );
  expect(screen.queryByRole('header')).toBeNull();
});

test.each([
  [375, 1, 327, 'row', 'column'],
  [320, 1, 272, 'column', 'column'],
  [430, 1.5, 382, 'column', 'column'],
  [768, 1, 700, 'row', 'row'],
] as const)(
  'matchup reflows measured width %s and scale %s without clipping identity',
  (width, fontScale, measuredWidth, matchupDirection, portraitDirection) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, fontScale, height: 667, scale: 3 });
    const longName = 'Mira Keeper of the Faraway Library';
    const screen = render(
      <VersusStrip
        left={{
          name: longName,
          archetype: 'mystic',
          signatureColor: '#CCAAFF',
          hp: 72,
          hpMax: 100,
        }}
        right={{
          name: 'Rook Guardian of the Last Ember',
          archetype: 'warrior',
          signatureColor: '#FF9977',
          hp: 38,
          hpMax: 100,
        }}
      />,
    );
    fireEvent(screen.getByTestId('battle-matchup'), 'layout', {
      nativeEvent: {
        layout: { width: measuredWidth, height: 200, x: 0, y: 0 },
      },
    });
    expect(
      StyleSheet.flatten(screen.getByTestId('battle-matchup').props.style)
        .flexDirection,
    ).toBe(matchupDirection);
    expect(
      StyleSheet.flatten(
        screen.getByTestId('battle-matchup-body-left').props.style,
      ).flexDirection,
    ).toBe(portraitDirection);
    expect(screen.getByText(longName).props.numberOfLines).toBeUndefined();
    expect(
      screen.getByRole('progressbar', {
        name: `${longName}: 72 HP out of 100`,
      }),
    ).toBeTruthy();
  },
);

test('selected move passes its own color into the actual bevel and keeps a separate check', () => {
  const { GameBevel } = require('@/components/game');
  const {
    MOVE_TILE_COLORS,
  } = require('@/components/game/battle/BattleMoveTile');
  const screen = render(
    <BattleMovePicker value="attack" onChange={jest.fn()} />,
  );
  expect(
    screen.getByTestId('game-icon-attack', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByTestId('move-selected-attack')).toBeTruthy();
  expect(screen.UNSAFE_getAllByType(GameBevel)[0].props.color).toBe(
    MOVE_TILE_COLORS.attack,
  );
  fireEvent(screen.getByTestId('battle-move-options'), 'layout', {
    nativeEvent: { layout: { width: 280, height: 100, x: 0, y: 0 } },
  });
  expect(
    StyleSheet.flatten(screen.getByTestId('battle-move-options').props.style)
      .flexDirection,
  ).toBe('column');
});
