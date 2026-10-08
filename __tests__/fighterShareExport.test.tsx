import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import FighterShareExport from '@/components/profile/FighterShareExport';
import FighterCard from '@/components/game/FighterCard';
import { useFonts } from 'expo-font';
import { NO_COSMETICS, resolveEquippedCosmetics } from '@/utils/cosmetics';
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: jest.fn(() => [true, null]),
}));
const fighter = {
  name: 'Mira 星',
  archetype: 'mystic',
  renderUri: 'fighter',
  signatureColor: '#abc',
  cosmetics: NO_COSMETICS,
  maxArtworkHeight: 180,
};
beforeEach(() => {
  jest.useFakeTimers();
  (useFonts as jest.Mock).mockReturnValue([true, null]);
});
afterEach(() => jest.useRealTimers());
it('exports full-size art independent of the screen after layout, fonts and artwork are ready', async () => {
  const ready = jest.fn(),
    error = jest.fn();
  const view = render(
    <FighterShareExport fighter={fighter} onReady={ready} onError={error} />,
  );
  const card = view.UNSAFE_getByType(FighterCard);
  expect(card.props.maxArtworkHeight).toBeUndefined();
  expect(view.queryByText(fighter.name)).toBeNull(); // hidden from accessibility
  fireEvent(
    view.getByTestId('fighter-share-export', { includeHiddenElements: true }),
    'layout',
    { nativeEvent: { layout: { width: 384, height: 700 } } },
  );
  expect(ready).not.toHaveBeenCalled();
  act(() => card.props.onArtworkLoaded());
  await act(async () => jest.advanceTimersByTime(100));
  expect(ready).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});
it('waits for ornamental frame and uses system font fallback when font loading fails', async () => {
  (useFonts as jest.Mock).mockReturnValue([
    false,
    new Error('font unavailable'),
  ]);
  const ready = jest.fn();
  const view = render(
    <FighterShareExport
      fighter={{
        ...fighter,
        cosmetics: resolveEquippedCosmetics({ frame: 'astral_codex_frame' }),
      }}
      onReady={ready}
      onError={jest.fn()}
    />,
  );
  fireEvent(
    view.getByTestId('fighter-share-export', { includeHiddenElements: true }),
    'layout',
    {},
  );
  const card = view.UNSAFE_getByType(FighterCard);
  act(() => card.props.onArtworkLoaded());
  await act(async () => jest.advanceTimersByTime(100));
  expect(ready).not.toHaveBeenCalled();
  act(() => card.props.onFrameLoaded());
  await act(async () => jest.advanceTimersByTime(100));
  expect(ready).toHaveBeenCalledTimes(1);
});
it('does not share incomplete art when image loading fails or times out', async () => {
  const ready = jest.fn(),
    error = jest.fn();
  const view = render(
    <FighterShareExport fighter={fighter} onReady={ready} onError={error} />,
  );
  act(() => view.UNSAFE_getByType(FighterCard).props.onImageError());
  await act(async () => jest.advanceTimersByTime(13000));
  expect(error).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
});
