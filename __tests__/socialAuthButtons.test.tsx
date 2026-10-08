/* eslint-disable @typescript-eslint/no-require-imports -- Native component mocks must resolve dependencies inside Jest factories. */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  userEvent,
  act,
} from '@testing-library/react-native';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { SignInMethods } from '@/components/auth/SignInMethods';
import { supabase, invokeAuthenticatedFunction } from '@/utils/supabase';

let mockUser: any = {
  id: 'player-a',
  is_anonymous: false,
  identities: [{ provider: 'email' }],
};
const mockLinkAuth = {
  setSession: jest.fn(),
  linkIdentity: jest.fn(),
  refreshSession: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockLinkAuth })),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(), getSession: jest.fn(), setSession: jest.fn() },
  },
  invokeAuthenticatedFunction: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 0 },
  AppleAuthenticationButton: (props: any) =>
    require('react').createElement(require('react-native').Pressable, props),
  AppleAuthenticationButtonType: { CONTINUE: 2, SIGN_IN: 0, SIGN_UP: 1 },
  AppleAuthenticationButtonStyle: { WHITE: 2 },
}));
jest.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: {
    configure: jest.fn(),
    checkPlayServices: jest.fn(),
    presentExplicitSignIn: jest.fn(),
  },
  GoogleSignInButton: (props: any) =>
    require('react').createElement(require('react-native').Pressable, props),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (size) => new Uint8Array(size).fill(7)),
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUser = {
    id: 'player-a',
    is_anonymous: false,
    identities: [{ provider: 'email' }],
  };
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
    'web.apps.googleusercontent.com';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
    'ios.apps.googleusercontent.com';
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
    identityToken: 'apple-token',
    authorizationCode: 'apple-code',
    state: '07'.repeat(16),
  });
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    success: true,
  });
  const session = {
    user: mockUser,
    access_token: 'access-a',
    refresh_token: 'refresh-a',
  };
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session },
    error: null,
  });
  mockLinkAuth.setSession.mockResolvedValue({
    data: { session, user: mockUser },
    error: null,
  });
  (supabase.auth.setSession as jest.Mock).mockResolvedValue({
    data: { session, user: mockUser },
    error: null,
  });
  mockLinkAuth.linkIdentity.mockResolvedValue({
    data: {
      session,
      user: {
        ...mockUser,
        identities: [...mockUser.identities, { provider: 'google' }],
      },
    },
    error: null,
  });
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
    type: 'success',
    data: { idToken: 'google-token' },
  });
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: mockUser },
    error: null,
  });
});

it('prevents overlapping provider actions while one is pending', async () => {
  const user = userEvent.setup();
  let finish!: () => void;
  const onPress = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<SocialAuthButtons onPress={onPress} />);
  const google = await screen.findByRole('button', {
    name: 'Sign in with Google',
  });
  await user.press(google);
  const apple = screen.getByRole('button', { name: 'Sign in with Apple' });
  expect(apple).toBeDisabled();
  await user.press(apple);
  expect(onPress).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(apple).toBeEnabled());
});

it('does not display an error when native sign-in is cancelled', async () => {
  render(
    <SocialAuthButtons
      onPress={async () => {
        throw { code: 'ERR_REQUEST_CANCELED' };
      }}
    />,
  );
  fireEvent.press(
    await screen.findByRole('button', { name: 'Sign in with Apple' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Sign in with Apple' }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('shows no provider controls when the rollout is unavailable', async () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '0';
  render(<SocialAuthButtons onPress={jest.fn()} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

it('lists connected identities and removes a connection button after linking', async () => {
  render(<SignInMethods />);
  expect(await screen.findByText('Email · Connected')).toBeTruthy();
  fireEvent.press(
    await screen.findByRole('button', { name: 'Connect Google' }),
  );
  expect(await screen.findByText('Google · Connected')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Connect Google' })).toBeNull();
});

it('keeps linked methods unchanged after cancellation', async () => {
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
    type: 'cancelled',
    data: null,
  });
  render(<SignInMethods />);
  fireEvent.press(
    await screen.findByRole('button', { name: 'Connect Google' }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Connect Google' }),
    ).toBeEnabled(),
  );
  expect(screen.queryByText('Google · Connected')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('offers guest email linking even without native providers', async () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '0';
  mockUser = { id: 'guest', is_anonymous: true, identities: [] };
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: mockUser },
    error: null,
  });
  render(<SignInMethods />);
  expect(await screen.findByText('Guest account')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Connect Google' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Connect Apple' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Connect email' }));
  expect(await screen.findByLabelText('Email')).toBeTruthy();
});

it('does not call an unverified guest email connected', async () => {
  mockUser = {
    id: 'guest',
    is_anonymous: true,
    new_email: 'pending@example.com',
    identities: [{ provider: 'email' }],
  };
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: mockUser },
    error: null,
  });
  render(<SignInMethods />);
  await screen.findByRole('button', { name: 'Continue email setup' });
  expect(screen.queryByText('Email · Connected')).toBeNull();
});

it('offers explicit conflict choices without switching accounts automatically', async () => {
  const load = jest.fn();
  mockLinkAuth.linkIdentity.mockResolvedValue({
    data: { user: null, session: null },
    error: { code: 'identity_already_exists' },
  });
  render(<SignInMethods onLoadExistingAccount={load} />);
  fireEvent.press(
    await screen.findByRole('button', { name: 'Connect Google' }),
  );
  const keep = await screen.findByRole('button', { name: 'Keep playing' });
  expect(
    screen.getByRole('button', { name: 'Use another method' }),
  ).toBeTruthy();
  expect(load).not.toHaveBeenCalled();
  fireEvent.press(keep);
  expect(
    screen.queryByRole('button', { name: 'Load existing account' }),
  ).toBeNull();
  fireEvent.press(
    await screen.findByRole('button', { name: 'Connect Google' }),
  );
  fireEvent.press(
    await screen.findByRole('button', { name: 'Load existing account' }),
  );
  expect(load).toHaveBeenCalledTimes(1);
});

it('does not publish a native link after leaving Settings', async () => {
  let finish!: (value: unknown) => void;
  mockLinkAuth.linkIdentity.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { unmount } = render(<SignInMethods />);
  fireEvent.press(
    await screen.findByRole('button', { name: 'Connect Google' }),
  );
  await waitFor(() =>
    expect(mockLinkAuth.linkIdentity).toHaveBeenCalledTimes(1),
  );
  unmount();
  await act(async () =>
    finish({
      data: {
        user: mockUser,
        session: {
          user: mockUser,
          access_token: 'linked',
          refresh_token: 'refresh',
        },
      },
      error: null,
    }),
  );
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

it.each(['before', 'after'])(
  'keeps an Apple retention error and retry when the linked user renders %s failure',
  async (renderTiming) => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    mockUser = { id: 'guest', is_anonymous: true, identities: [] };
    const linkedUser = {
      id: 'guest',
      is_anonymous: false,
      identities: [{ provider: 'apple' }],
    };
    const session = () => ({
      user: mockUser,
      access_token: 'access',
      refresh_token: 'refresh',
    });
    (supabase.auth.getSession as jest.Mock).mockImplementation(async () => ({
      data: { session: session() },
      error: null,
    }));
    (supabase.auth.getUser as jest.Mock).mockImplementation(async () => ({
      data: { user: mockUser },
      error: null,
    }));
    mockLinkAuth.setSession.mockImplementation(async () => ({
      data: { session: session(), user: mockUser },
      error: null,
    }));
    const linkedSession = { ...session(), user: linkedUser };
    mockLinkAuth.linkIdentity.mockResolvedValue({
      data: { session: linkedSession, user: linkedUser },
      error: null,
    });
    mockLinkAuth.refreshSession.mockResolvedValue({
      data: { session: linkedSession, user: linkedUser },
      error: null,
    });
    (supabase.auth.setSession as jest.Mock).mockImplementation(async () => {
      mockUser = linkedUser;
      return {
        data: { session: linkedSession, user: linkedUser },
        error: null,
      };
    });
    let rejectRetention!: (reason: Error) => void;
    (invokeAuthenticatedFunction as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRetention = reject;
        }),
    );
    const view = render(<SignInMethods />);
    fireEvent.press(
      await screen.findByRole('button', { name: 'Connect Apple' }),
    );
    await waitFor(() =>
      expect(invokeAuthenticatedFunction).toHaveBeenCalledTimes(1),
    );
    if (renderTiming === 'before') view.rerender(<SignInMethods />);
    await act(async () => rejectRetention(new Error('offline')));
    if (renderTiming === 'after') view.rerender(<SignInMethods />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Apple/);
    expect(mockUser).toMatchObject({ id: 'guest', is_anonymous: false });
    fireEvent.press(
      await screen.findByRole('button', { name: 'Reconnect Apple' }),
    );
    await waitFor(() =>
      expect(invokeAuthenticatedFunction).toHaveBeenCalledTimes(2),
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(mockLinkAuth.linkIdentity).toHaveBeenCalledTimes(1);
    expect(mockLinkAuth.refreshSession).toHaveBeenCalledTimes(1);
    expect(invokeAuthenticatedFunction).toHaveBeenLastCalledWith(
      'apple-authorization',
      { authorization_code: 'apple-code', nonce: '07'.repeat(32) },
      { expectedAccountId: 'guest' },
    );
    view.unmount();
    render(<SignInMethods />);
    expect(
      await screen.findByRole('button', { name: 'Reconnect Apple' }),
    ).toBeEnabled();
  },
);
