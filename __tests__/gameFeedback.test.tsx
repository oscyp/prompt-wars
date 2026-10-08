import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { GameFeedback } from '@/components/game/GameFeedback';
it('keeps inline startup feedback as one busy heading with a decorative icon', () => {
  const view = render(
    <GameFeedback
      icon="arena"
      title="Opening your Arena…"
      busy
      layout="inline"
    />,
  );
  expect(view.getAllByRole('header')).toHaveLength(1);
  expect(
    view.getByRole('header', { name: 'Opening your Arena…' }).props
      .accessibilityState,
  ).toEqual({ busy: true });
  expect(view.queryByTestId('game-icon-arena')).toBeNull();
  expect(
    view.getByTestId('game-icon-arena', { includeHiddenElements: true }).props
      .accessible,
  ).toBe(false);
});

it('keeps error guidance and Retry separately accessible, without implying empty data', () => {
  const retry = jest.fn();
  const view = render(
    <GameFeedback
      icon="replay"
      title="Couldn’t load fighters"
      message="Check your connection."
      tone="error"
      action={{ label: 'Retry', onPress: retry }}
    />,
  );
  expect(
    view.getByRole('header', { name: 'Couldn’t load fighters' }),
  ).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(view.queryByText(/No fighters/)).toBeNull();
});
