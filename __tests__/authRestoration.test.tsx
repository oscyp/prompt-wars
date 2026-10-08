import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/utils/supabase';

let mockAuthChanged: (event: string, session: unknown) => void;
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
      onAuthStateChange: (callback: typeof mockAuthChanged) => {
        mockAuthChanged = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
    },
  },
}));
jest.mock('@/utils/notifications', () => ({ deactivatePushToken: jest.fn() }));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: () => ({ remove: jest.fn() }),
}));
const guest = {
  user: { id: 'saved-guest', is_anonymous: true },
  access_token: 'existing',
  refresh_token: 'existing-refresh',
  expires_at: 4102444800,
};
function Probe() {
  const auth = useAuth();
  return (
    <Text testID="auth" onPress={() => void auth.retrySessionRestore()}>
      {JSON.stringify({
        id: auth.user?.id,
        loading: auth.loading,
        error: auth.restorationError,
      })}
    </Text>
  );
}
const snapshot = (view: ReturnType<typeof render>) =>
  JSON.parse(view.getByTestId('auth').props.children);
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: guest }, error: null } as never);
});

test('restores the persisted guest without creating a replacement', async () => {
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(snapshot(view)).toEqual({
      id: 'saved-guest',
      loading: false,
      error: false,
    }),
  );
});

test.each(['returned', 'thrown'])(
  'a %s restoration failure holds entry until an explicit retry succeeds',
  async (kind) => {
    if (kind === 'returned')
      jest
        .mocked(supabase.auth.getSession)
        .mockResolvedValueOnce({
          data: { session: null },
          error: new Error('offline'),
        } as never);
    else
      jest
        .mocked(supabase.auth.getSession)
        .mockRejectedValueOnce(new Error('offline'));
    const view = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(snapshot(view)).toEqual({ loading: false, error: true }),
    );
    fireEvent.press(view.getByTestId('auth'));
    await waitFor(() =>
      expect(snapshot(view)).toEqual({
        id: 'saved-guest',
        loading: false,
        error: false,
      }),
    );
  },
);

test('an expired persisted guest with a failed refresh is not treated as signed out', async () => {
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValueOnce({
      data: { session: { ...guest, expires_at: 1 } },
      error: null,
    } as never);
  jest
    .mocked(supabase.auth.refreshSession)
    .mockResolvedValueOnce({
      data: { session: null },
      error: new Error('offline'),
    } as never);
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() =>
    expect(snapshot(view)).toEqual({ loading: false, error: true }),
  );
  fireEvent.press(view.getByTestId('auth'));
  await waitFor(() => expect(snapshot(view).id).toBe('saved-guest'));
});

test('a late failed restore does not replace a newer signed-in session', async () => {
  let reject!: (error: Error) => void;
  jest.mocked(supabase.auth.getSession).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => mockAuthChanged('SIGNED_IN', guest));
  await act(async () => reject(new Error('late offline')));
  expect(snapshot(view)).toEqual({
    id: 'saved-guest',
    loading: false,
    error: false,
  });
});

test('a hanging restore exposes retry instead of staying on the splash forever', async () => {
  jest.useFakeTimers();
  jest
    .mocked(supabase.auth.getSession)
    .mockReturnValueOnce(new Promise(() => {}));
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => jest.advanceTimersByTime(15000));
  expect(snapshot(view)).toEqual({ loading: false, error: true });
  view.unmount();
  jest.useRealTimers();
});
