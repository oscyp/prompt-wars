import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import BattleListPortrait from '@/components/BattleListPortrait';
import { playerAvatarCache } from '@/hooks/usePlayerAvatars';
import { invokeFunctionResult } from '@/utils/supabase';
import { presentationFor } from '@/constants/Cosmetics';
let mockAccount = 'alice';
jest.mock('@/utils/supabase', () => ({
  invokeFunctionResult: jest.fn(),
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: mockAccount } } },
      }),
    },
  },
}));
jest.mock('@/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
const props = {
  accountId: 'alice',
  battleId: 'battle-a',
  side: 'player_two' as const,
  visible: true,
  fallbackUri: 'fallback',
  accentColor: 'blue',
  name: 'Whisper',
  size: 44,
};
const label = "Whisper's fighter portrait";
const response = (id: string, url: string) => ({
  data: {
    battles: {
      [id]: {
        status: 'available',
        asset_id: id + '-asset',
        signed_url: url,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
    },
  },
  error: null,
});
beforeEach(() => {
  mockAccount = 'alice';
  AppState.currentState = 'active';
  playerAvatarCache.setAccount(null);
  (invokeFunctionResult as jest.Mock).mockReset();
});
it('uses a page-prefetched avatar when a row becomes visible later', async () => {
  (invokeFunctionResult as jest.Mock).mockResolvedValue(
    response('battle-a', 'prefetched'),
  );
  await act(async () => {
    await playerAvatarCache.request('alice', [
      { kind: 'battles', id: 'battle-a' },
    ]);
  });
  const view = render(<BattleListPortrait {...props} visible={false} />);
  view.rerender(<BattleListPortrait {...props} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(view.getByLabelText(label).props.source.uri).toBe('prefetched');
  expect(invokeFunctionResult).toHaveBeenCalledTimes(1);
});
it('batches visible rows and rejects stale account or recycled-row responses', async () => {
  const finishes: ((value: unknown) => void)[] = [];
  (invokeFunctionResult as jest.Mock).mockImplementation(
    () => new Promise((done) => finishes.push(done)),
  );
  const view = render(<BattleListPortrait {...props} visible={false} />);
  expect(invokeFunctionResult).not.toHaveBeenCalled();
  view.rerender(<BattleListPortrait {...props} />);
  await waitFor(() => expect(finishes).toHaveLength(1));
  mockAccount = 'bob';
  view.rerender(
    <BattleListPortrait {...props} accountId="bob" battleId="battle-b" />,
  );
  await waitFor(() => expect(finishes).toHaveLength(2));
  await act(async () => finishes[0](response('battle-a', 'old-account')));
  expect(view.getByLabelText(label).props.source.uri).toBe('fallback');
  await act(async () => finishes[1](response('battle-b', 'new-account')));
  expect(view.getByLabelText(label).props.source.uri).toBe('new-account');
  view.rerender(
    <BattleListPortrait {...props} accountId="bob" battleId="battle-c" />,
  );
  expect(view.getByLabelText(label).props.source.uri).toBe('fallback');
});
it('image failure retries signing once, with no generation or purchase call', async () => {
  (invokeFunctionResult as jest.Mock)
    .mockResolvedValueOnce(response('battle-a', 'expired'))
    .mockResolvedValueOnce(response('battle-a', 'fresh'));
  const view = render(<BattleListPortrait {...props} />);
  await waitFor(() =>
    expect(view.getByLabelText(label).props.source.uri).toBe('expired'),
  );
  fireEvent(view.getByLabelText(label), 'error', {
    nativeEvent: { error: 'Gone' },
  });
  expect(view.getByLabelText(label).props.source.uri).toBe('fallback');
  await waitFor(() =>
    expect(view.getByLabelText(label).props.source.uri).toBe('fresh'),
  );
  expect(invokeFunctionResult).toHaveBeenCalledTimes(2);
  expect(invokeFunctionResult).toHaveBeenLastCalledWith('sign-player-avatars', {
    profile_ids: [],
    battle_ids: ['battle-a'],
  });
});
it('foreground removal clears approved art while preserving frozen equipment', async () => {
  const listeners: ((state: string) => void)[] = [];
  const spy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, fn) => {
      listeners.push(fn as (state: string) => void);
      return { remove: jest.fn() };
    });
  (invokeFunctionResult as jest.Mock)
    .mockResolvedValueOnce(response('battle-a', 'frozen'))
    .mockResolvedValueOnce({
      data: { battles: { 'battle-a': { status: 'unavailable' } } },
    });
  const snapshot: any = {
    player_two: { cosmetic_config: { frame: 'astral_codex_frame' } },
  };
  const view = render(<BattleListPortrait {...props} snapshot={snapshot} />);
  await waitFor(() =>
    expect(view.getByLabelText(label).props.source.uri).toBe('frozen'),
  );
  act(() => listeners.forEach((fn) => fn('background')));
  act(() => listeners.forEach((fn) => fn('active')));
  await waitFor(() =>
    expect(view.getByLabelText(label).props.source.uri).toBe('fallback'),
  );
  expect(
    view.getByTestId('frame-artwork', { includeHiddenElements: true }).props
      .source,
  ).toEqual(
    (presentationFor('astral_codex_frame') as any).artwork.avatar.source,
  );
  spy.mockRestore();
});
