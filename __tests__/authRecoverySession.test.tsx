import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import {
  beginAuthOperation,
  setRecoverySessionSafely,
} from '@/utils/authSession';
import { supabase } from '@/utils/supabase';
import { deactivatePushToken } from '@/utils/notifications';

let mockAuthChange: (event: string, session: unknown) => void;
let mockCurrentSession = mockMakeSession('a');
function mockMakeSession(id: string) {
  return {
    user: { id },
    access_token: `access-${id}`,
    refresh_token: `refresh-${id}`,
  };
}
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: mockCurrentSession },
        error: null,
      })),
      onAuthStateChange: (callback: typeof mockAuthChange) => {
        mockAuthChange = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      },
      exchangeCodeForSession: jest.fn(async (code) => {
        mockCurrentSession = mockMakeSession(code);
        mockAuthChange('SIGNED_IN', mockCurrentSession);
        return {
          data: { session: mockCurrentSession, user: mockCurrentSession.user },
          error: null,
        };
      }),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));
jest.mock('@/utils/notifications', () => ({
  deactivatePushToken: jest.fn(async () => {}),
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: () => ({ remove: jest.fn() }),
}));

let auth!: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return <Text>{String(auth.recoveryPending)}</Text>;
}
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  mockCurrentSession = mockMakeSession('a');
});

test('late password completion preserves a newer recovery and cannot sign it out', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () =>
    mockAuthChange('PASSWORD_RECOVERY', mockCurrentSession),
  );
  const passwordOperation = beginAuthOperation();
  await act(async () => {
    await setRecoverySessionSafely({ code: 'b' });
  });
  await act(async () => {
    await expect(
      auth.completeRecovery(passwordOperation),
    ).rejects.toMatchObject({ code: 'session_changed' });
  });
  expect(auth.user?.id).toBe('b');
  expect(auth.recoveryPending).toBe(true);
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

test('signout waiting for push deactivation cannot clear a newer recovery flag', async () => {
  let finishDeactivation!: () => void;
  jest.mocked(deactivatePushToken).mockReturnValueOnce(
    new Promise((resolve) => {
      finishDeactivation = resolve;
    }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () =>
    mockAuthChange('PASSWORD_RECOVERY', mockCurrentSession),
  );
  const leaving = auth.signOut().then(
    () => null,
    (error) => error,
  );
  await act(async () => {
    await setRecoverySessionSafely({ code: 'b' });
  });
  await act(async () => {
    finishDeactivation();
    expect(await leaving).toMatchObject({ code: 'session_changed' });
  });
  expect(auth.user?.id).toBe('b');
  expect(auth.recoveryPending).toBe(true);
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
