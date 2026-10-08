import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ResultShareExport from '@/components/ResultShareExport';
import ResultShareCard, {
  type ResultShareCardProps,
} from '@/components/ResultShareCard';
import { resolveEquippedCosmetics } from '@/utils/cosmetics';
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));
const card: ResultShareCardProps = {
  headline: 'Victory',
  outcome: 'won',
  isKo: false,
  scoreLine: '2–1',
  winnerSide: 'me',
  theme: null,
  ratingLine: null,
  me: {
    name: 'Mira 星',
    archetype: 'mystic',
    avatarUrl: 'me',
    cosmetics: resolveEquippedCosmetics({ frame: 'astral_codex_frame' }),
  },
  them: { name: 'Vex', archetype: 'titan', avatarUrl: 'them' },
  adjudicationRevision: 1,
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
it('waits for both portraits, the equipped frame, and layout before exporting', async () => {
  const ready = jest.fn();
  const view = render(
    <ResultShareExport card={card} onReady={ready} onError={jest.fn()} />,
  );
  fireEvent(
    view.getByTestId('result-share-export', { includeHiddenElements: true }),
    'layout',
    {},
  );
  const exported = view.UNSAFE_getByType(ResultShareCard);
  act(() => {
    exported.props.onArtworkLoaded('me:avatar');
    exported.props.onArtworkLoaded('them:avatar');
  });
  await act(async () => jest.advanceTimersByTime(100));
  expect(ready).not.toHaveBeenCalled();
  act(() => exported.props.onArtworkLoaded('me:frame'));
  await act(async () => jest.advanceTimersByTime(100));
  expect(ready).toHaveBeenCalledTimes(1);
});
it('reports incomplete artwork once and never captures it', async () => {
  const ready = jest.fn(),
    error = jest.fn();
  const view = render(
    <ResultShareExport card={card} onReady={ready} onError={error} />,
  );
  act(() => view.UNSAFE_getByType(ResultShareCard).props.onArtworkError());
  await act(async () => jest.advanceTimersByTime(13000));
  expect(error).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
});
