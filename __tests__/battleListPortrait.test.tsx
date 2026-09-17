import React from 'react';
import { AppState, View, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import BattleListPortrait from '@/components/BattleListPortrait';
import { invokeFunctionResult } from '@/utils/supabase';
import { presentationFor } from '@/constants/Cosmetics';
jest.mock('@/utils/supabase', () => ({ invokeFunctionResult: jest.fn() }));
jest.mock('@/components/game/battle/useBattlePresentationActive', () => ({
  useBattlePresentationActive: () => false,
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const snapshot: any = {
  player_two: {
    avatar: {
      image_path: 'frozen/avatar.png',
      thumb_path: 'frozen/avatar-thumb.png',
    },
  },
};
const props = {
  accountId: 'alice',
  battleId: 'portrait-test',
  side: 'player_two' as const,
  snapshot,
  visible: false,
  fallbackUri: 'fallback',
  accentColor: 'blue',
  name: 'Whisper',
  size: 44,
};
it('only signs visible assigned avatars and never shows a previous account response', async () => {
  let finish!: (value: any) => void;
  (invokeFunctionResult as jest.Mock).mockImplementation(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const view = render(<BattleListPortrait {...props} />);
  expect(invokeFunctionResult).not.toHaveBeenCalled();
  view.rerender(<BattleListPortrait {...props} visible />);
  await waitFor(() => expect(invokeFunctionResult).toHaveBeenCalledTimes(1));
  const first = finish;
  view.rerender(<BattleListPortrait {...props} visible accountId="bob" />);
  await waitFor(() => expect(invokeFunctionResult).toHaveBeenCalledTimes(2));
  await act(async () =>
    first({
      data: { player_two: { portrait_url: 'alice-avatar' } },
      error: null,
    }),
  );
  expect(view.queryByLabelText("Whisper's avatar")).toBeNull();
  await act(async () =>
    finish({
      data: { player_two: { portrait_url: 'bob-avatar' } },
      error: null,
    }),
  );
  expect(view.getByLabelText("Whisper's avatar").props.source.uri).toBe(
    'bob-avatar',
  );
});

it('falls back after an image failure and re-signs the same frozen asset on foreground', async () => {
  const listeners: ((state: string) => void)[] = [];
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() };
    });
  (invokeFunctionResult as jest.Mock)
    .mockReset()
    .mockResolvedValueOnce({
      data: { player_two: { portrait_url: 'failed-uri' } },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { player_two: { portrait_url: 'fresh-uri' } },
      error: null,
    });
  const view = render(
    <BattleListPortrait {...props} battleId="failure-test" visible />,
  );
  await waitFor(() =>
    expect(view.getByLabelText("Whisper's avatar").props.source.uri).toBe(
      'failed-uri',
    ),
  );
  fireEvent(view.getByLabelText("Whisper's avatar"), 'error', {
    nativeEvent: { error: 'Gone' },
  });
  expect(view.queryByLabelText("Whisper's avatar")).toBeNull();
  expect(view.getByLabelText("Whisper's archetype").props.source.uri).toBe(
    'fallback',
  );
  expect(invokeFunctionResult).toHaveBeenCalledTimes(1);
  await act(async () => listeners.forEach((listener) => listener('active')));
  await waitFor(() =>
    expect(view.getByLabelText("Whisper's avatar").props.source.uri).toBe(
      'fresh-uri',
    ),
  );
  expect(invokeFunctionResult).toHaveBeenNthCalledWith(
    2,
    'sign-battle-portraits',
    { battle_id: 'failure-test' },
  );
  subscription.mockRestore();
});

it('preserves the frozen equipped frame around the assigned avatar', async () => {
  const subscription = jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  (invokeFunctionResult as jest.Mock).mockReset().mockResolvedValue({
    data: { player_two: { portrait_url: 'frozen-framed-avatar' } },
    error: null,
  });
  const framed = {
    ...snapshot,
    player_two: {
      ...snapshot.player_two,
      cosmetic_config: {
        frame: 'astral_codex_frame',
        avatar_effect: 'plus_aura',
      },
    },
  };
  const view = render(
    <BattleListPortrait {...props} battleId="frame-test" snapshot={framed} />,
  );
  const hasAura = () =>
    view.UNSAFE_getAllByType(View).some((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.shadowRadius === 10 && style?.shadowColor === '#A78BFA';
    });
  expect(hasAura()).toBe(true);
  view.rerender(
    <BattleListPortrait
      {...props}
      battleId="frame-test"
      snapshot={framed}
      visible
    />,
  );
  await waitFor(() =>
    expect(view.getByLabelText("Whisper's avatar").props.source.uri).toBe(
      'frozen-framed-avatar',
    ),
  );
  expect(
    view.getByTestId('frame-artwork', { includeHiddenElements: true }).props
      .source,
  ).toEqual(
    (presentationFor('astral_codex_frame') as any).artwork.avatar.source,
  );
  expect(hasAura()).toBe(true);
  view.unmount();
  subscription.mockRestore();
});
