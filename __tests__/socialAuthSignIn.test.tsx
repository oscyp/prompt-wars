/* eslint-disable @typescript-eslint/no-require-imports -- Native component mocks must resolve dependencies inside Jest factories. */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import SignInScreen from '@/app/(auth)/sign-in';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { supabase } from '@/utils/supabase';
import {
  beginAuthOperation,
  assertAuthOperationCurrent,
} from '@/utils/authSession';

const mockExchange = {
  signInWithPassword: jest.fn(),
  signInWithIdToken: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockExchange })),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
let mockParams: { switchAccount?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-font', () => ({ isLoaded: jest.fn(() => false) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/components', () => ({
  InlineBanner: 'InlineBanner',
  Toast: 'Toast',
}));
jest.mock('@/utils/haptics', () => ({
  hapticError: jest.fn(),
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (size) => new Uint8Array(size).fill(7)),
  digestStringAsync: jest.fn(async () => 'hashed-nonce'),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
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
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      setSession: jest.fn(),
      signInWithIdToken: jest.fn(),
      signInWithPassword: jest.fn(),
      resetPasswordForEmail: jest.fn(),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED;
  mockParams = {};
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
    'web.apps.googleusercontent.com';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
    'ios.apps.googleusercontent.com';
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: null },
    error: null,
  });
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
    type: 'success',
    data: { idToken: 'provider-token' },
  });
});

it('adult launch sign-in can return to entry without exposing social providers', async () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '0';
  process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED = '1';
  const view = render(<SignInScreen />);
  fireEvent.press(await view.findByLabelText('Back to play options'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/entry');
  expect(
    view.queryByRole('button', { name: 'Sign in with Google' }),
  ).toBeNull();
  expect(view.queryByRole('button', { name: 'Sign in with Apple' })).toBeNull();
});

it('returning to adult play options cancels a pending email sign-in', async () => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '0';
  process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED = '1';
  let finish!: (value: unknown) => void;
  mockExchange.signInWithPassword.mockReturnValueOnce(
    new Promise((done) => {
      finish = done;
    }),
  );
  const view = render(<SignInScreen />);
  fireEvent.changeText(view.getByLabelText('Email'), 'player@example.com');
  fireEvent.changeText(view.getByLabelText('Password'), 'secure-password');
  fireEvent.press(view.getByLabelText('Sign in'));
  await waitFor(() =>
    expect(mockExchange.signInWithPassword).toHaveBeenCalled(),
  );
  fireEvent.press(view.getByLabelText('Back to play options'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/entry');
  await act(async () =>
    finish({
      data: {
        session: {
          user: { id: 'returning' },
          access_token: 'a',
          refresh_token: 'r',
        },
      },
      error: null,
    }),
  );
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

it('routes a new social identity to explicit registration without putting its token in navigation', async () => {
  mockExchange.signInWithIdToken.mockResolvedValue({
    data: { session: null },
    error: { code: 'hook_error', message: 'registration_required' },
  });
  render(<SignInScreen />);
  fireEvent.press(
    await screen.findByRole('button', { name: 'Sign in with Google' }),
  );
  await waitFor(() =>
    expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/sign-up'),
  );
});

it('leaves the login form ready after provider cancellation', async () => {
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
    type: 'cancelled',
    data: null,
  });
  render(<SignInScreen />);
  fireEvent.press(
    await screen.findByRole('button', { name: 'Sign in with Google' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled(),
  );
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('disables email sign-in and password reset while native account selection is pending', async () => {
  let cancel!: (value: unknown) => void;
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockImplementation(
    () =>
      new Promise((resolve) => {
        cancel = resolve;
      }),
  );
  render(<SignInScreen />);
  fireEvent.changeText(screen.getByLabelText('Email'), 'fighter@example.com');
  fireEvent.changeText(screen.getByLabelText('Password'), 'my-password');
  fireEvent.press(
    await screen.findByRole('button', { name: 'Sign in with Google' }),
  );
  await waitFor(() =>
    expect(GoogleOneTapSignIn.presentExplicitSignIn).toHaveBeenCalled(),
  );
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Forgot password?' }),
  ).toBeDisabled();
  await userEvent
    .setup()
    .press(screen.getByRole('button', { name: 'Sign in' }));
  expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  await act(async () => cancel({ type: 'cancelled', data: null }));
});

it('explicit existing-account load preserves the guest and never opens registration for a new social identity', async () => {
  mockParams = { switchAccount: '1' };
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: 'guest', is_anonymous: true } } },
    error: null,
  });
  mockExchange.signInWithIdToken.mockResolvedValue({
    data: { session: null },
    error: { code: 'hook_error', message: 'registration_required' },
  });
  const view = render(<SignInScreen />);
  expect(view.queryByLabelText('Don’t have an account? Sign up')).toBeNull();
  fireEvent.press(
    await view.findByRole('button', { name: 'Sign in with Google' }),
  );
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Sign in' })).toBeEnabled(),
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockExchange.signInWithIdToken).toHaveBeenCalledTimes(1);
  fireEvent.press(view.getByLabelText('Back to guest progress'));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(profile)/settings');
});

it('canceling account load invalidates a pending isolated authentication response', async () => {
  mockParams = { switchAccount: '1' };
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: 'guest', is_anonymous: true } } },
    error: null,
  });
  let finish!: (value: unknown) => void;
  mockExchange.signInWithIdToken.mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  const view = render(<SignInScreen />);
  fireEvent.press(
    await view.findByRole('button', { name: 'Sign in with Google' }),
  );
  await waitFor(() =>
    expect(mockExchange.signInWithIdToken).toHaveBeenCalled(),
  );
  fireEvent.press(view.getByLabelText('Back to guest progress'));
  await act(async () =>
    finish({
      data: {
        session: {
          user: { id: 'returning' },
          access_token: 'a',
          refresh_token: 'r',
        },
      },
      error: null,
    }),
  );
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

it('leaving an older sign-in screen does not cancel a newer auth intent', async () => {
  let finish!: (value: unknown) => void;
  mockExchange.signInWithIdToken.mockReturnValue(
    new Promise((done) => {
      finish = done;
    }),
  );
  const view = render(<SignInScreen />);
  fireEvent.press(
    await view.findByRole('button', { name: 'Sign in with Google' }),
  );
  await waitFor(() =>
    expect(mockExchange.signInWithIdToken).toHaveBeenCalled(),
  );
  const newer = beginAuthOperation();
  view.unmount();
  expect(() => assertAuthOperationCurrent(newer)).not.toThrow();
  await act(async () =>
    finish({ data: { session: null }, error: { code: 'cancelled' } }),
  );
});
