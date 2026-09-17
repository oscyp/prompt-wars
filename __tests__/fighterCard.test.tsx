import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Image, StyleSheet } from 'react-native';
import FighterCard from '@/components/game/FighterCard';
import { NO_COSMETICS, resolveEquippedCosmetics } from '@/utils/cosmetics';

const fighter = {
  name: 'Łucja 星の騎士 VeryLongUnbrokenFighterName',
  archetype: 'mystic',
  renderUri: 'full-body',
  avatarUri: 'avatar',
  signatureColor: '#C4AFFE',
  cosmetics: NO_COSMETICS,
  stats: { strength: 5, stamina: 5, agility: 5, focus: 5 },
};
test('compact identity uses its avatar; hero contains full artwork and keeps untruncated names', () => {
  const view = render(<FighterCard {...fighter} variant="compact" />);
  expect(
    view
      .UNSAFE_getAllByType(Image)
      .find((i) => i.props.source?.uri === 'avatar'),
  ).toBeTruthy();
  expect(view.getByText(fighter.name).props.numberOfLines).toBeUndefined();
  view.rerender(<FighterCard {...fighter} variant="hero" />);
  const art = view
    .UNSAFE_getAllByType(Image)
    .find((i) => i.props.source?.uri === 'full-body')!;
  expect(art.props.resizeMode).toBe('contain');
  expect(view.getByLabelText('Strength 5 of 10')).toBeTruthy();
});
test('collection reuses frame apertures and omits a second ornamental frame', () => {
  const view = render(
    <FighterCard
      {...fighter}
      variant="collection"
      cosmetics={resolveEquippedCosmetics({ frame: 'astral_codex_frame' })}
    />,
  );
  const frame = view.getByTestId('cosmetic-frame', {
    includeHiddenElements: true,
  });
  const size = StyleSheet.flatten(frame.props.style);
  expect(size.height / size.width).toBe(1.5);
  expect(view.queryByTestId('fighter-default-frame')).toBeNull();
});
test('art failure keeps identity readable and a new URL can recover', () => {
  const view = render(<FighterCard {...fighter} />);
  fireEvent(
    view.getByTestId('fighter-hero-image', { includeHiddenElements: true }),
    'error',
  );
  expect(view.getByText(fighter.name)).toBeTruthy();
  view.rerender(<FighterCard {...fighter} renderUri="renewed" />);
  expect(
    view.getByTestId('fighter-hero-image', { includeHiddenElements: true })
      .props.source,
  ).toEqual({ uri: 'renewed' });
});
