import React from 'react';
import { render } from '@testing-library/react-native';
import { isLoaded } from 'expo-font';
import { GameDisplayTitle } from '@/components/game/GameDisplayTitle';

jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));

it('keeps an authored title visible and scalable without the font', () => {
  const view = render(<GameDisplayTitle>Enter the Arena</GameDisplayTitle>);
  const title = view.getByRole('header', { name: 'ENTER THE ARENA' });
  expect(title.props.allowFontScaling).toBe(true);
  expect(title.props.numberOfLines).toBeUndefined();
  expect(title).not.toHaveStyle({ opacity: 0 });
});

it('preserves casing when requested and keeps unsupported names readable', () => {
  jest.mocked(isLoaded).mockReturnValue(true);
  const view = render(
    <GameDisplayTitle uppercase={false} finish="gold">
      李小龍 Łucja
    </GameDisplayTitle>,
  );
  expect(view.getByText('李小龍 Łucja')).not.toHaveStyle({
    fontFamily: 'BarlowCondensed-ExtraBoldItalic',
  });
  expect(view.getByText('李小龍 Łucja')).not.toHaveStyle({ opacity: 0 });
});
