import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import SignUpScreen from '@/app/(auth)/sign-up';
import * as registration from '@/utils/registration';
import { supabase } from '@/utils/supabase';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
  signInAnonymouslySafely,
  signUpWithPasswordSafely,
} from '@/utils/authSession';

let mockGuest: string | undefined = '1';
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ guest: mockGuest }),
  useRouter: () => ({ replace: mockReplace }),
  Redirect: 'Redirect',
}));
jest.mock('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: jest.fn(async () => {}),
}));
jest.mock('@/hooks/useNativeHeaderOffset', () => ({
  useNativeHeaderOffset: () => 0,
}));
jest.mock('@/utils/registration', () => ({
  getRegistrationConfiguration: jest.fn(),
  authorizeAdultGuest: jest.fn(),
}));
jest.mock('@/utils/authSession', () => ({
  ...jest.requireActual('@/utils/authSession'),
  signInAnonymouslySafely: jest.fn(),
  signUpWithPasswordSafely: jest.fn(),
}));

const ready = {
  enabled: false,
  adult_guest_signup_enabled: true,
  guest_signup_enabled: false,
  guardian_consent_ready: false,
  minimum_client_version: '1.4.0',
};
const permit = {
  authorized: true as const,
  authorization_token: 'opaque-adult-guest-permit',
  permit_expires_at: '2099-01-01T00:00:00Z',
};
const ageLabel = 'I confirm I am 18 years of age or older';
const termsLabel = 'I agree to the Terms and acknowledge the Privacy Policy';

beforeEach(() => {
  jest.clearAllMocks();
  mockGuest = '1';
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED = '1';
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: null }, error: null });
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockResolvedValue(ready);
  jest.mocked(registration.authorizeAdultGuest).mockResolvedValue(permit);
  jest.mocked(signInAnonymouslySafely).mockResolvedValue({
    data: { session: { user: { id: 'adult-guest', is_anonymous: true } } },
    error: null,
  } as never);
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED;
  jest.restoreAllMocks();
});

async function confirm(view: ReturnType<typeof render>) {
  fireEvent.press(await view.findByLabelText(ageLabel));
  fireEvent.press(view.getByLabelText(termsLabel));
}

test('adult play requires both confirmations before requesting or redeeming a permit', async () => {
  const view = render(<SignUpScreen />);
  const play = await view.findByLabelText('Play now');
  expect(play).toBeDisabled();
  expect(view.queryByLabelText('Date of birth')).toBeNull();
  expect(view.queryByLabelText('Country or region')).toBeNull();
  expect(view.queryByLabelText('Email')).toBeNull();
  expect(view.queryByLabelText('Password')).toBeNull();
  expect(view.queryByText(/Google|Apple/)).toBeNull();
  expect(view.getByText(/device.*session/i)).toBeTruthy();
  fireEvent.press(play);
  expect(registration.authorizeAdultGuest).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText(ageLabel));
  fireEvent.press(play);
  expect(registration.authorizeAdultGuest).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText(termsLabel));
  fireEvent.press(play);
  await waitFor(() =>
    expect(signInAnonymouslySafely).toHaveBeenCalledWith(
      {
        options: {
          data: { adult_guest_authorization: 'opaque-adult-guest-permit' },
        },
      },
      expect.objectContaining({ revision: expect.any(Number) }),
    ),
  );
  expect(registration.authorizeAdultGuest).toHaveBeenCalledWith({
    age_confirmed: true,
    terms_accepted: true,
  });
  expect(signUpWithPasswordSafely).not.toHaveBeenCalled();
});

test.each([
  { ...ready, adult_guest_signup_enabled: false },
  { ...ready, adult_guest_signup_enabled: undefined },
  { ...ready, enabled: true },
  { ...ready, enabled: undefined },
])(
  'disabled or incompatible configuration never offers adult signup: %j',
  async (config) => {
    jest
      .mocked(registration.getRegistrationConfiguration)
      .mockResolvedValue(config as never);
    const view = render(<SignUpScreen />);
    await view.findByText('Guest play is not available yet');
    expect(view.queryByLabelText('Play now')).toBeNull();
    expect(registration.authorizeAdultGuest).not.toHaveBeenCalled();
    expect(signInAnonymouslySafely).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Back'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/entry');
  },
);

test('offline configuration fails closed and requires an explicit retry', async () => {
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockRejectedValueOnce(new Error('offline'));
  const view = render(<SignUpScreen />);
  await view.findByText('Could not check guest play');
  expect(view.queryByLabelText('Play now')).toBeNull();
  expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('Retry'));
  expect(await view.findByLabelText('Play now')).toBeDisabled();
});

test.each([
  { ...permit, authorized: false },
  { ...permit, authorized: undefined },
  { ...permit, authorization_token: '' },
  { ...permit, authorization_token: '   ' },
  { ...permit, authorization_token: 123 },
  { ...permit, permit_expires_at: 'not-a-date' },
  { ...permit, permit_expires_at: '2000-01-01T00:00:00Z' },
  null,
])(
  'a malformed or expired permit never reaches anonymous authentication: %j',
  async (response) => {
    jest
      .mocked(registration.authorizeAdultGuest)
      .mockResolvedValue(response as never);
    const view = render(<SignUpScreen />);
    await confirm(view);
    fireEvent.press(view.getByLabelText('Play now'));
    await view.findByText(
      'Guest play could not be authorized. Please try again.',
    );
    expect(signInAnonymouslySafely).not.toHaveBeenCalled();
    expect(view.getByLabelText('Play now')).toBeEnabled();
  },
);

test('repeated taps create a single pending authorization and a failed request can retry', async () => {
  let reject!: (reason: Error) => void;
  jest.mocked(registration.authorizeAdultGuest).mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  const view = render(<SignUpScreen />);
  await confirm(view);
  const play = view.getByLabelText('Play now');
  act(() => {
    fireEvent.press(play);
    fireEvent.press(play);
  });
  await waitFor(() =>
    expect(registration.authorizeAdultGuest).toHaveBeenCalledTimes(1),
  );
  expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  await act(async () => reject(new Error('Network request failed')));
  fireEvent.press(view.getByLabelText('Play now'));
  await waitFor(() => expect(signInAnonymouslySafely).toHaveBeenCalledTimes(1));
});

test.each(['unmount', 'account switch', 'new authentication intent'])(
  'late authorization after %s cannot create or replace an account',
  async (change) => {
    let resolve!: (value: typeof permit) => void;
    jest.mocked(registration.authorizeAdultGuest).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(<SignUpScreen />);
    await confirm(view);
    fireEvent.press(view.getByLabelText('Play now'));
    await waitFor(() =>
      expect(registration.authorizeAdultGuest).toHaveBeenCalled(),
    );
    if (change === 'unmount') view.unmount();
    else if (change === 'account switch')
      jest
        .mocked(supabase.auth.getSession)
        .mockResolvedValue({
          data: { session: { user: { id: 'restored' } } },
          error: null,
        } as never);
    else beginAuthOperation();
    await act(async () => resolve(permit));
    expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  },
);

test('leaving during anonymous exchange invalidates the operation before session publication', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(signInAnonymouslySafely).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }) as never,
  );
  const view = render(<SignUpScreen />);
  await confirm(view);
  fireEvent.press(view.getByLabelText('Play now'));
  await waitFor(() => expect(signInAnonymouslySafely).toHaveBeenCalled());
  const operation = jest.mocked(signInAnonymouslySafely).mock.calls[0][1]!;
  view.unmount();
  expect(() => assertAuthOperationCurrent(operation)).toThrow();
  await act(async () =>
    resolve({ data: { session: null }, error: { code: 'session_changed' } }),
  );
});

test('terms and privacy links remain functional before accepting them', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const view = render(<SignUpScreen />);
  fireEvent.press(await view.findByLabelText('Terms and conditions'));
  fireEvent.press(view.getByLabelText('Privacy policy'));
  expect(open).toHaveBeenNthCalledWith(
    1,
    'https://promptwars.gg/terms-and-conditions.html',
  );
  expect(open).toHaveBeenNthCalledWith(
    2,
    'https://promptwars.gg/privacy-policy.html',
  );
});

test('ordinary email registration remains the existing adult signup while social auth is disabled', async () => {
  mockGuest = undefined;
  jest
    .mocked(signUpWithPasswordSafely)
    .mockResolvedValue({
      data: { user: { identities: [{}] }, session: null },
      error: null,
    } as never);
  const view = render(<SignUpScreen />);
  fireEvent.changeText(view.getByLabelText('Email'), 'player@example.com');
  fireEvent.changeText(view.getByLabelText('Password'), 'secure-password');
  fireEvent.press(view.getByLabelText(ageLabel));
  fireEvent.press(view.getByLabelText('Sign up'));
  await waitFor(() =>
    expect(signUpWithPasswordSafely).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'secure-password',
      options: { data: { age_confirmed: true } },
    }),
  );
  expect(view.getByText(/check your inbox/i)).toBeTruthy();
  expect(view.queryByText(/Google|Apple/)).toBeNull();
  expect(registration.authorizeAdultGuest).not.toHaveBeenCalled();
});
