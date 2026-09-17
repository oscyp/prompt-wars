import React from 'react';
import { GamePanel } from '@/components/game';
import { Path } from 'react-native-svg';
import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import VersusStrip from '@/components/VersusStrip';
import CosmeticFrame from '@/components/CosmeticFrame';
import {
  COSMETIC_PRESENTATION,
  type FramePresentation,
} from '@/constants/Cosmetics';
import { NO_COSMETICS } from '@/utils/cosmetics';
jest.mock('expo-font', () => ({ isLoaded: () => true }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const left = { name: 'Mira', archetype: 'mystic', signatureColor: '#BCA1EF' };
const right = { name: 'Rook', archetype: 'warrior', signatureColor: '#EDAC71' };
beforeEach(() =>
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 }),
);
test('ordinary phone uses mirrored inline portraits; keyboard removes decoration only', () => {
  const screen = render(<VersusStrip left={left} right={right} />);
  fireEvent(screen.getByTestId('battle-matchup'), 'layout', {
    nativeEvent: { layout: { width: 350, height: 100, x: 0, y: 0 } },
  });
  expect(
    StyleSheet.flatten(
      screen.getByTestId('battle-matchup-body-left').props.style,
    ).flexDirection,
  ).toBe('row');
  expect(
    StyleSheet.flatten(
      screen.getByTestId('battle-matchup-body-right').props.style,
    ).flexDirection,
  ).toBe('row-reverse');
  expect(screen.getAllByTestId('battle-chamfered-portrait')).toHaveLength(2);
  screen.rerender(<VersusStrip left={left} right={right} compact />);
  expect(screen.queryByTestId('battle-chamfered-portrait')).toBeNull();
  expect(screen.getByText('Mira')).toBeTruthy();
  expect(screen.getByText('Rook')).toBeTruthy();
});
test('equipped artwork preserves its circle aperture and asset aspect ratio', () => {
  const frame = COSMETIC_PRESENTATION.laureate_frame as FramePresentation;
  const screen = render(
    <VersusStrip
      left={{ ...left, cosmetics: { ...NO_COSMETICS, frame } }}
      right={right}
    />,
  );
  const cosmetic = screen.UNSAFE_getByType(CosmeticFrame);
  expect(cosmetic.props.frame).toBe(frame);
  expect(cosmetic.props.variant).toBeUndefined();
  const aperture = StyleSheet.flatten(
    screen.getByTestId('frame-aperture').props.style,
  );
  expect(aperture.width).toBe(aperture.height);
  expect(aperture.borderRadius).toBe(aperture.width / 2);
  expect(screen.getAllByTestId('battle-chamfered-portrait')).toHaveLength(1);
});

test('duel uses two inward gold plates, prominent portraits and no enclosing ornamental panel', () => {
  const screen = render(<VersusStrip left={left} right={right} />);
  expect(screen.UNSAFE_queryAllByType(GamePanel)).toHaveLength(0);
  expect(
    screen
      .getAllByTestId('battle-chamfered-portrait')
      .map((node) => node.props.width),
  ).toEqual([72, 72]);
  const diamond = StyleSheet.flatten(
    screen.getByTestId('battle-versus-diamond').props.style,
  );
  expect(diamond.width).toBeGreaterThanOrEqual(42);
  expect(diamond.height).toBeGreaterThanOrEqual(42);
  for (const side of ['left', 'right']) {
    fireEvent(screen.getByTestId(`battle-matchup-${side}`), 'layout', {
      nativeEvent: { layout: { width: 160, height: 100, x: 0, y: 0 } },
    });
    expect(
      screen.getByTestId(`battle-identity-plate-${side}`, {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
  }
  const paths = screen.UNSAFE_getAllByType(Path).map((node) => node.props.d);
  expect(paths).toContain('M 10 1 H 145 L 159 50 L 145 99 H 10 L 1 90 V 10 Z');
  expect(paths).toContain('M 15 1 H 150 L 159 10 V 90 L 150 99 H 15 L 1 50 Z');
});

test('long identities retain equal columns within the measured matchup width', () => {
  const screen = render(
    <VersusStrip
      left={{ ...left, name: 'AleksandraNieprzerwanieDługaNazwaBohaterki' }}
      right={{ ...right, name: '星の守護者・アレクサンドラ' }}
    />,
  );
  fireEvent(screen.getByTestId('battle-matchup'), 'layout', {
    nativeEvent: { layout: { width: 335, height: 160, x: 0, y: 0 } },
  });
  for (const side of ['left', 'right']) {
    const style = StyleSheet.flatten(
      screen.getByTestId(`battle-matchup-${side}`).props.style,
    );
    expect(style.width).toBe(142.5);
    expect(style.flex).toBe(0);
  }
});

test('measured multiline names move below both portraits without hiding identity', () => {
  const name = 'AleksandraNieprzerwanieDługaNazwaBohaterki';
  const screen = render(<VersusStrip left={{ ...left, name }} right={right} />);
  fireEvent(screen.getByText(name), 'textLayout', {
    nativeEvent: {
      lines: [
        { text: 'Aleksandra' },
        { text: 'Nieprzerwanie' },
        { text: 'DługaNazwaBohaterki' },
      ],
    },
  });
  for (const side of ['left', 'right']) {
    expect(
      StyleSheet.flatten(
        screen.getByTestId(`battle-matchup-body-${side}`).props.style,
      ).flexDirection,
    ).toBe('column');
  }
  expect(screen.getByText(name)).toBeTruthy();
  screen.rerender(<VersusStrip left={left} right={right} />);
  expect(
    StyleSheet.flatten(
      screen.getByTestId('battle-matchup-body-left').props.style,
    ).flexDirection,
  ).toBe('row');
});

test('a wrapped archetype also reflows the plates before breaking a compact label', () => {
  const screen = render(<VersusStrip left={left} right={right} />);
  fireEvent(screen.getByText('MYSTIC'), 'textLayout', {
    nativeEvent: { lines: [{ text: 'MYSTI' }, { text: 'C' }] },
  });
  expect(
    StyleSheet.flatten(
      screen.getByTestId('battle-matchup-body-left').props.style,
    ).flexDirection,
  ).toBe('column');
});
