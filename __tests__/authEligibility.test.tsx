import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { setRecoverySessionSafely } from '@/utils/authSession';

let mockAuthChanged: (event: string, session: unknown) => void;
let mockHandleLink: (event: { url: string }) => void;
jest.mock('@/utils/authSession', () => ({
  beginAuthOperation: jest.fn(),
  setRecoverySessionSafely: jest.fn(),
  signOutSafely: jest.fn(),
}));
const mockReads: {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}[] = [];
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: (callback: typeof mockAuthChanged) => {
        mockAuthChanged = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      signOut: jest.fn(async () => {}),
    },
  },
}));
jest.mock('@/utils/registration', () => ({
  getAccountEligibility: () =>
    new Promise((resolve, reject) => mockReads.push({ resolve, reject })),
}));
jest.mock('@/utils/notifications', () => ({
  deactivatePushToken: jest.fn(async () => {}),
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: (_: string, callback: typeof mockHandleLink) => {
    mockHandleLink = callback;
    return { remove: jest.fn() };
  },
}));

const eligible = {
  enabled: true,
  status: 'eligible',
  can_play: true,
  can_generate: true,
  can_purchase: true,
  can_grant: true,
};
function Probe() {
  const auth = useAuth();
  return (
    <>
      <Text testID="access" onPress={() => void auth.refreshEligibility()}>
        {JSON.stringify({
          id: auth.user?.id,
          access: auth.eligibility,
          loading: auth.eligibilityLoading,
          error: auth.eligibilityError,
        })}
      </Text>
      <Text testID="recovery">
        {JSON.stringify({
          pending: auth.recoveryPending,
          processing: auth.recoveryProcessing,
        })}
      </Text>
    </>
  );
}
function snapshot(view: ReturnType<typeof render>) {
  return JSON.parse(view.getByTestId('access').props.children);
}
async function login(id: string) {
  await act(async () => mockAuthChanged('SIGNED_IN', { user: { id } }));
}
beforeEach(() => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  mockReads.length = 0;
  jest.clearAllMocks();
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
});

test('new-release eligibility cannot use a previous accounts response after a direct switch', async () => {
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  await login('alice');
  expect(snapshot(view).loading).toBe(true);
  await login('bob');
  await act(async () => mockReads[0].resolve(eligible));
  expect(snapshot(view)).toEqual({
    id: 'bob',
    access: null,
    loading: true,
    error: false,
  });
  await act(async () => mockReads[1].reject(new Error('offline')));
  await waitFor(() =>
    expect(snapshot(view)).toEqual({
      id: 'bob',
      access: null,
      loading: false,
      error: true,
    }),
  );
});

test('sign-out invalidates an in-flight eligibility response', async () => {
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  await login('alice');
  await act(async () => mockAuthChanged('SIGNED_OUT', null));
  await act(async () => mockReads[0].resolve(eligible));
  expect(snapshot(view)).toEqual({
    access: null,
    loading: false,
    error: false,
  });
});

test('an unsuccessful recheck removes a previous eligibility allow decision', async () => {
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  await login('alice');
  await act(async () => mockReads[0].resolve(eligible));
  expect(snapshot(view).access.can_play).toBe(true);
  fireEvent.press(view.getByTestId('access'));
  expect(snapshot(view)).toEqual({
    id: 'alice',
    access: null,
    loading: true,
    error: false,
  });
  await act(async () => mockReads[1].reject(new Error('offline')));
  expect(snapshot(view)).toEqual({
    id: 'alice',
    access: null,
    loading: false,
    error: true,
  });
});

test('a superseded recovery link cannot clear the newer recovery loading state', async () => {
  const requests: {
    resolve: (value: unknown) => void;
    reject: (failure: unknown) => void;
  }[] = [];
  jest
    .mocked(setRecoverySessionSafely)
    .mockImplementation(
      () =>
        new Promise((resolve, reject) =>
          requests.push({ resolve, reject }),
        ) as never,
    );
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  await act(async () =>
    mockHandleLink({ url: 'promptwars://reset-password?code=first' }),
  );
  await act(async () =>
    mockHandleLink({ url: 'promptwars://reset-password?code=second' }),
  );
  await act(async () => requests[0].reject({ code: 'session_changed' }));
  expect(JSON.parse(view.getByTestId('recovery').props.children)).toEqual({
    pending: false,
    processing: true,
  });
  await act(async () => requests[1].resolve({ data: {}, error: null }));
  expect(JSON.parse(view.getByTestId('recovery').props.children)).toEqual({
    pending: true,
    processing: false,
  });
  warning.mockRestore();
});

test('disabled rollout preserves legacy sessions without new eligibility requests', async () => {
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  const view = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  await login('alice');
  expect(mockReads).toHaveLength(0);
  expect(snapshot(view)).toEqual({
    id: 'alice',
    access: null,
    loading: false,
    error: false,
  });
});
