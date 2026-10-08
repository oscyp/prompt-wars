import React from 'react';
import { Image, StyleSheet, useWindowDimensions } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import PortraitPreview from '@/components/PortraitPreview';
import ResultVerdict, {
  resultFinalHp,
  type ResultVerdictFighter,
} from '@/components/battle/ResultVerdict';

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const me: ResultVerdictFighter = {
  name: 'Żaneta Keeper of the Faraway Library',
  archetype: 'mystic',
  avatarUrl: 'viewer-avatar',
  signatureColor: '#C4AFFE',
  role: 'You',
  cosmetics: {
    frame: { kind: 'frame' as const, colors: ['#F5C542'], width: 4 },
    title: null,
    badge: null,
    avatarEffect: null,
  },
};
const them: ResultVerdictFighter = {
  name: 'Rook of the Last Ember',
  archetype: 'titan',
  avatarUrl: null,
  signatureColor: '#FF9977',
  role: 'Opponent',
  isBot: true,
};

beforeEach(() => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest.spyOn(Image, 'resolveAssetSource').mockReturnValue({
    uri: 'bundled-avatar',
    width: 512,
    height: 512,
    scale: 1,
  });
});

afterEach(() => jest.restoreAllMocks());

test.each([
  ['won', 'Victory'],
  ['lost', 'Defeat'],
  ['draw', 'Draw'],
  ['no_contest', 'No contest'],
] as const)('shows the single current heading for %s', (outcome, heading) => {
  const screen = render(
    <ResultVerdict outcome={outcome} isKo={false} me={me} them={them} />,
  );
  expect(screen.getByRole('header', { name: heading })).toBeTruthy();
  expect(
    ['Victory', 'Defeat', 'Draw', 'No contest'].filter(
      (label) => screen.queryByText(label) !== null,
    ),
  ).toEqual([heading]);
});

test('keeps the viewer left, uses equipped portraits, and groups the series result', () => {
  const screen = render(
    <ResultVerdict
      outcome="won"
      isKo
      scoreLine="2–1"
      me={me}
      them={them}
      winnerSide="me"
      exhibition
      finalHp={{
        me: { current: 42, max: 96 },
        them: { current: 0, max: 104 },
      }}
    />,
  );

  expect(
    screen.getAllByTestId(/^result-fighter-/).map((node) => node.props.testID),
  ).toEqual(['result-fighter-me', 'result-fighter-them']);
  expect(screen.getByText('You')).toBeTruthy();
  expect(screen.getByText('AI opponent · Practice')).toBeTruthy();
  expect(screen.getByText('MYSTIC')).toBeTruthy();
  expect(screen.getByText('TITAN')).toBeTruthy();
  expect(screen.getByTestId('result-winner-me')).toBeTruthy();
  expect(screen.queryByTestId('result-winner-them')).toBeNull();
  expect(screen.getByTestId('result-score-cluster')).toHaveTextContent('2–1KO');
  expect(screen.getByText('2–1').props.numberOfLines).toBe(1);
  expect(
    screen.getByText(
      'Unrated exhibition — backup judge used; rating and competitive streak unchanged.',
    ),
  ).toBeTruthy();

  const portraits = screen.UNSAFE_getAllByType(PortraitPreview);
  expect(portraits[0].props).toMatchObject({
    uri: 'viewer-avatar',
    frame: me.cosmetics?.frame,
  });
  expect(portraits[1].props.uri).toBe('bundled-avatar');
  expect(
    screen.getByRole('progressbar', {
      name: `${me.name}: 42 HP out of 96`,
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('progressbar', {
      name: `${them.name}: 0 HP out of 104`,
    }),
  ).toBeTruthy();
});

test('keeps a single-format knockout without inventing a score', () => {
  const screen = render(
    <ResultVerdict
      outcome="lost"
      isKo
      scoreLine={null}
      me={me}
      them={{ ...them, isBot: false }}
      winnerSide="them"
    />,
  );
  expect(screen.getByText('VS')).toBeTruthy();
  expect(screen.getByText('KO')).toBeTruthy();
  expect(screen.queryByText(/\d+–\d+/)).toBeNull();
  expect(screen.getByTestId('result-winner-them')).toBeTruthy();
});

test('keeps the matchup and score compact at the measured width of a 375-point phone', () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 375, height: 812, scale: 3, fontScale: 1 });
  const screen = render(
    <ResultVerdict
      outcome="won"
      isKo
      scoreLine="2–1"
      me={me}
      them={them}
      winnerSide="me"
    />,
  );
  fireEvent(screen.getByTestId('result-matchup'), 'layout', {
    nativeEvent: { layout: { width: 311, height: 200, x: 0, y: 0 } },
  });
  expect(
    StyleSheet.flatten(screen.getByTestId('result-matchup').props.style)
      .flexDirection,
  ).toBe('row');
  expect(
    StyleSheet.flatten(screen.getByTestId('result-score-cluster').props.style)
      .flexDirection,
  ).toBe('row');
  expect(
    StyleSheet.flatten(screen.getByTestId('result-fighter-me').props.style),
  ).toMatchObject({ flexBasis: 0, flexGrow: 1, flexShrink: 1, width: 0 });
});

test('suppresses every competitive decoration for a no-contest review', () => {
  const screen = render(
    <ResultVerdict
      outcome="no_contest"
      isKo
      scoreLine="2–0"
      me={me}
      them={them}
      winnerSide="me"
      adjudicationRevision={2}
      ratingLine="Original rating points reversed. No replacement rating."
      finalHp={{
        me: { current: 75, max: 96 },
        them: { current: 12, max: 104 },
      }}
    />,
  );
  expect(screen.queryByText('2–0')).toBeNull();
  expect(screen.queryByText('KO')).toBeNull();
  expect(screen.queryByText('VS')).toBeNull();
  expect(screen.queryByTestId(/^result-winner-/)).toBeNull();
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  expect(screen.getByText('Reviewed result · revision 2')).toBeTruthy();
  expect(
    screen.getByText('Original rating points reversed. No replacement rating.'),
  ).toBeTruthy();
});

test.each([
  null,
  { me: { current: 42, max: 96 } },
  { me: { current: 42, max: 0 }, them: { current: 3, max: 104 } },
  { me: { current: Number.NaN, max: 96 }, them: { current: 3, max: 104 } },
])('does not invent final HP for an incomplete snapshot %#', (finalHp) => {
  const screen = render(
    <ResultVerdict
      outcome="draw"
      isKo={false}
      scoreLine="1–1"
      me={me}
      them={them}
      finalHp={finalHp}
    />,
  );
  expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  expect(screen.queryByText('/100 HP')).toBeNull();
});

test.each([
  { width: 320, fontScale: 1 },
  { width: 430, fontScale: 1.2 },
])(
  'reflows score and complete fighter identity at $width points / $fontScale text scale',
  ({ width, fontScale }) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width, height: 800, scale: 3, fontScale });
    const screen = render(
      <ResultVerdict
        outcome="won"
        isKo
        scoreLine="2–1"
        me={me}
        them={{ ...them, isBot: false }}
        winnerSide="me"
      />,
    );
    fireEvent(screen.getByTestId('result-matchup'), 'layout', {
      nativeEvent: { layout: { width: width - 32, height: 200, x: 0, y: 0 } },
    });
    expect(
      StyleSheet.flatten(screen.getByTestId('result-matchup').props.style)
        .flexDirection,
    ).toBe('column');
    expect(
      screen.getByTestId('result-score-cluster').props.accessibilityLabel,
    ).toBe('Series score 2–1. Knockout.');
    expect(screen.getByText(me.name).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(them.name).props.numberOfLines).toBeUndefined();
  },
);

test.each([
  [true, { current: 72, max: 96 }, { current: 18, max: 104 }],
  [false, { current: 18, max: 104 }, { current: 72, max: 96 }],
] as const)(
  'orients reviewed final HP from the viewer seat when player one is %s',
  (isPlayerOne, expectedMe, expectedThem) => {
    expect(
      resultFinalHp({
        round: { player_one_hp_after: 72, player_two_hp_after: 18 },
        battle: { player_one_hp_max: 96, player_two_hp_max: 104 },
        isPlayerOne,
        noContest: false,
      }),
    ).toEqual({ me: expectedMe, them: expectedThem });
  },
);

test('omits route HP when a recorded maximum is unknown or the result is no contest', () => {
  const round = { player_one_hp_after: 72, player_two_hp_after: 18 };
  expect(
    resultFinalHp({
      round,
      battle: { player_one_hp_max: null, player_two_hp_max: 104 },
      isPlayerOne: true,
      noContest: false,
    }),
  ).toBeNull();
  expect(
    resultFinalHp({
      round,
      battle: { player_one_hp_max: 96, player_two_hp_max: 104 },
      isPlayerOne: true,
      noContest: true,
    }),
  ).toBeNull();
});
