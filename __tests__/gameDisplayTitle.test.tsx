import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { UIManager, useWindowDimensions } from 'react-native';
import { isLoaded } from 'expo-font';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 375, height: 812, scale: 3, fontScale: 1 })),
}));
jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('@react-native-masked-view/masked-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) =>
    React.createElement(View, { ...props, testID: 'native-title-mask' });
});
afterEach(() => jest.restoreAllMocks());

it('keeps an authored title visible and scalable without the font', () => {
  const view = render(<GameDisplayTitle>Enter the Arena</GameDisplayTitle>);
  const title = view.getByRole('header', { name: 'ENTER THE ARENA' });
  expect(title.props.allowFontScaling).toBe(true);
  expect(title.props.numberOfLines).toBeUndefined();
  expect(title).not.toHaveStyle({ opacity: 0 });
});

it('paints measured native glyphs while exposing exactly one heading, then falls back for explicit ink', () => {
  jest.mocked(isLoaded).mockReturnValue(true);
  jest.spyOn(UIManager, 'getViewManagerConfig').mockReturnValue({} as never);
  const view = render(
    <GameDisplayTitle>Words across two lines</GameDisplayTitle>,
  );
  expect(view.queryByTestId('native-title-mask')).toBeNull();
  fireEvent(view.getByRole('header'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 220, height: 96 } },
  });
  expect(view.getAllByRole('header')).toHaveLength(1);
  expect(
    view.getByTestId('native-title-mask', { includeHiddenElements: true }).props
      .maskElement.props.accessible,
  ).toBe(false);
  view.rerender(
    <GameDisplayTitle style={{ color: '#fff' }}>
      Words across two lines
    </GameDisplayTitle>,
  );
  expect(
    view.queryByTestId('native-title-mask', { includeHiddenElements: true }),
  ).toBeNull();
  expect(view.getByRole('header')).toHaveStyle({ color: '#fff' });
});

it('preserves casing when requested and keeps unsupported names readable', () => {
  jest.mocked(isLoaded).mockReturnValue(true);
  const view = render(
    <GameDisplayTitle uppercase={false} finish="gold">
      李小龍 Łucja
    </GameDisplayTitle>,
  );
  expect(view.getByRole('header', { name: '李小龍 Łucja' })).not.toHaveStyle({
    fontFamily: 'BarlowCondensed-ExtraBoldItalic',
  });
  expect(view.getByRole('header', { name: '李小龍 Łucja' })).not.toHaveStyle({
    opacity: 0,
  });
});

it('returns to readable native ink until a live text-size change is measured', () => {
  jest.mocked(isLoaded).mockReturnValue(true);
  jest.spyOn(UIManager, 'getViewManagerConfig').mockReturnValue({} as never);
  const dimensions = jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 375, height: 812, scale: 3, fontScale: 1 });
  const view = render(
    <GameDisplayTitle>Wallet & Subscription</GameDisplayTitle>,
  );
  fireEvent(view.getByRole('header'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 335, height: 96 } },
  });
  expect(view.getByRole('header')).toHaveStyle({ color: 'transparent' });
  dimensions.mockReturnValue({
    width: 375,
    height: 812,
    scale: 3,
    fontScale: 2,
  });
  view.rerender(<GameDisplayTitle>Wallet & Subscription</GameDisplayTitle>);
  expect(view.getByRole('header')).not.toHaveStyle({ color: 'transparent' });
  fireEvent(view.getByRole('header'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 335, height: 288 } },
  });
  expect(view.getByRole('header')).toHaveStyle({ color: 'transparent' });
  expect(view.getAllByRole('header')).toHaveLength(1);
});
