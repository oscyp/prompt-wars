import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Image, StyleSheet } from 'react-native';
import FighterHero from '@/components/profile/FighterHero';
import { NO_COSMETICS, resolveEquippedCosmetics } from '@/utils/cosmetics';

const props = {
  name: 'Nova',
  archetype: 'warrior',
  battleCry: 'Forward',
  itemName: 'Shield',
  renderUri: 'signed',
  signatureColor: '#A78BFA',
  stats: null,
  cosmetics: NO_COSMETICS,
  onPress: jest.fn(),
};

it('keeps the default poster and edit action when no frame is equipped', () => {
  const view = render(<FighterHero {...props} />);
  expect(
    view.getByTestId('fighter-hero-image', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(view.queryByTestId('cosmetic-frame')).toBeNull();
  fireEvent.press(view.getByRole('button'));
  expect(props.onPress).toHaveBeenCalled();
});

it('shows a proportional framed portrait above the caption and falls back on load error', () => {
  const view = render(
    <FighterHero
      {...props}
      cosmetics={resolveEquippedCosmetics({ frame: 'astral_codex_frame' })}
    />,
  );
  const frame = view.getByTestId('cosmetic-frame', {
    includeHiddenElements: true,
  });
  const layout = StyleSheet.flatten(frame.props.style);
  expect(layout.height / layout.width).toBe(1.5);
  expect(
    StyleSheet.flatten(
      view.getByTestId('fighter-hero-caption', { includeHiddenElements: true })
        .props.style,
    ).paddingTop,
  ).toBeLessThan(30);
  const image = view
    .UNSAFE_getAllByType(Image)
    .find((image) => image.props.source?.uri === 'signed')!;
  expect(image.props.resizeMode).toBe('contain');
  fireEvent(image, 'error');
  expect(
    view
      .UNSAFE_getAllByType(Image)
      .some((image) => image.props.source?.uri === 'signed'),
  ).toBe(false);
});
