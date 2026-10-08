import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { RegistrationForm } from '@/components/auth/RegistrationForm';
import * as registration from '@/utils/registration';
import { supabase } from '@/utils/supabase';
import * as social from '@/utils/socialAuth';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
  signInAnonymouslySafely,
} from '@/utils/authSession';

const mockReplace = jest.fn();
jest.mock('@/utils/authSession', () => ({
  beginAuthOperation: jest.fn(() =>
    jest.requireActual('@/utils/authSession').beginAuthOperation(),
  ),
  assertAuthOperationCurrent: jest.requireActual('@/utils/authSession')
    .assertAuthOperationCurrent,
  signInAnonymouslySafely: jest.fn(),
  signUpWithPasswordSafely: jest.fn((input: unknown) =>
    jest.requireMock('@/utils/supabase').supabase.auth.signUp(input),
  ),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.4.0' } },
}));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@/hooks/useNativeHeaderOffset', () => ({
  useNativeHeaderOffset: () => 0,
}));
jest.mock('@/components/auth/SocialAuthButtons', () => ({
  SocialAuthButtons: ({
    disabled,
    onPress,
  }: {
    disabled: boolean;
    onPress: (provider: string) => void;
  }) => {
    const React = jest.requireActual('react');
    const { Button } = jest.requireActual('react-native');
    return React.createElement(Button, {
      title: 'Continue with Google',
      disabled,
      onPress: () => onPress('google'),
    });
  },
}));
jest.mock('@/utils/socialAuth', () => ({
  acquireSocialCredential: jest.fn(),
  signInWithSocialCredential: jest.fn(),
}));
jest.mock('@/utils/registration', () => ({
  getRegistrationConfiguration: jest.fn(),
  startRegistration: jest.fn(),
  checkRegistration: jest.fn(),
  authorizeRegistration: jest.fn(),
  completeExistingEligibility: jest.fn(),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      signUp: jest.fn(),
      resend: jest.fn(),
    },
  },
}));

const ready = {
  enabled: true,
  minimum_client_version: '1.4.0',
  guardian_consent_ready: false,
};
const pending = {
  status: 'consent_unavailable',
  registration_token: 'opaque-memory-only',
  expires_at: '2099-01-01T00:00:00Z',
};
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: null }, error: null });
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockResolvedValue(ready);
  jest
    .mocked(registration.startRegistration)
    .mockResolvedValue({ ...pending, status: 'eligible' } as never);
  jest.mocked(registration.authorizeRegistration).mockResolvedValue({
    authorized: true,
    authorization_id: 'server-permit',
    permit_expires_at: '2099-01-01T00:00:00Z',
  });
  jest.mocked(supabase.auth.signUp).mockResolvedValue({
    data: { user: { identities: [{}] }, session: null },
    error: null,
  } as never);
});

async function assess(view: ReturnType<typeof render>) {
  await waitFor(() =>
    expect(view.getByLabelText('Date of birth')).toBeTruthy(),
  );
  fireEvent.changeText(view.getByLabelText('Date of birth'), '2000-05-20');
  fireEvent.changeText(view.getByLabelText('Country or region'), 'Pol');
  fireEvent.press(view.getByLabelText('Poland'));
  fireEvent.press(view.getByLabelText('Continue'));
}

test('disabled server configuration does not collect birth details or create registration', async () => {
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockResolvedValue({ ...ready, enabled: false });
  const view = render(<RegistrationForm />);
  await waitFor(() =>
    expect(view.getByText('Registration is not available yet')).toBeTruthy(),
  );
  expect(view.queryByLabelText('Date of birth')).toBeNull();
  expect(registration.startRegistration).not.toHaveBeenCalled();
});

test('email signup requires the server age decision and bound authorization, without legacy age metadata', async () => {
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() => expect(view.getByLabelText('Email')).toBeTruthy());
  expect(registration.startRegistration).toHaveBeenCalledWith({
    birth_date: '2000-05-20',
    country: 'PL',
    subdivision: '',
  });
  expect(view.queryByLabelText('Date of birth')).toBeNull();
  fireEvent.changeText(view.getByLabelText('Email'), ' player@example.com ');
  fireEvent.changeText(view.getByLabelText('Password'), 'secure-password');
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Create account'));
  await waitFor(() =>
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'player@example.com',
      password: 'secure-password',
      options: { data: { registration_authorization: 'server-permit' } },
    }),
  );
  expect(registration.authorizeRegistration).toHaveBeenCalledWith(
    'opaque-memory-only',
    { email: 'player@example.com' },
  );
  expect(view.getByText(/check your inbox/i)).toBeTruthy();
});

test('unavailable guardian consent never offers account creation or a fabricated hosted link', async () => {
  jest
    .mocked(registration.startRegistration)
    .mockResolvedValue(pending as never);
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() =>
    expect(
      view.getByText('Guardian consent is not available yet'),
    ).toBeTruthy(),
  );
  expect(view.queryByLabelText('Email')).toBeNull();
  expect(view.queryByLabelText('Open guardian consent')).toBeNull();
  expect(registration.authorizeRegistration).not.toHaveBeenCalled();
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('an underage server rejection does not offer an immediate birthday-edit workaround', async () => {
  jest
    .mocked(registration.startRegistration)
    .mockRejectedValue({ body: { code: 'underage' } });
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() =>
    expect(view.getByText('You cannot create an account')).toBeTruthy(),
  );
  expect(view.queryByLabelText('Date of birth')).toBeNull();
  expect(view.queryByLabelText('Continue')).toBeNull();
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('a late authorization after leaving registration cannot create an account', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(registration.authorizeRegistration).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }) as never,
  );
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() => expect(view.getByLabelText('Email')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Email'), 'player@example.com');
  fireEvent.changeText(view.getByLabelText('Password'), 'secure-password');
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Create account'));
  await waitFor(() =>
    expect(registration.authorizeRegistration).toHaveBeenCalled(),
  );
  view.unmount();
  await act(async () => resolve({ authorization_id: 'late-permit' }));
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('an account change while the age decision is in flight cannot continue registration', async () => {
  let resolve!: (value: unknown) => void;
  jest.mocked(registration.startRegistration).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }) as never,
  );
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() =>
    expect(registration.startRegistration).toHaveBeenCalled(),
  );
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { user: { id: 'another-account' } } },
    error: null,
  } as never);
  await act(async () => resolve({ ...pending, status: 'eligible' }));
  expect(view.queryByLabelText('Email')).toBeNull();
  expect(
    view.getByText(
      'Your signed-in account changed. Reopen registration to continue.',
    ),
  ).toBeTruthy();
});

test('an expired authorization clears credentials and agreement before restarting', async () => {
  jest
    .mocked(registration.authorizeRegistration)
    .mockRejectedValue({ body: { code: 'registration_expired' } });
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() => expect(view.getByLabelText('Email')).toBeTruthy());
  fireEvent.changeText(view.getByLabelText('Email'), 'player@example.com');
  fireEvent.changeText(view.getByLabelText('Password'), 'secure-password');
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Create account'));
  await waitFor(() => expect(view.getByLabelText('Start again')).toBeTruthy());
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('Start again'));
  await assess(view);
  await waitFor(() =>
    expect(view.getByLabelText('Password').props.value).toBe(''),
  );
  expect(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ).props.accessibilityState.checked,
  ).toBe(false);
});

test('foregrounding a pending registration checks authoritative status and handles expiry', async () => {
  let foreground: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_, callback) => {
      foreground = callback;
      return { remove };
    });
  jest
    .mocked(registration.startRegistration)
    .mockResolvedValue(pending as never);
  jest
    .mocked(registration.checkRegistration)
    .mockRejectedValue({ body: { code: 'registration_expired' } });
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() => expect(foreground).toBeDefined());
  await act(async () => foreground?.('active'));
  expect(registration.checkRegistration).toHaveBeenCalledWith(
    'opaque-memory-only',
  );
  await waitFor(() => expect(view.getByLabelText('Start again')).toBeTruthy());
  expect(view.queryByLabelText('Create account')).toBeNull();
  expect(remove).toHaveBeenCalled();
  listener.mockRestore();
});

test('social signup authorizes the acquired identity before committing authentication', async () => {
  const credential = {
    provider: 'google',
    idToken: 'private-id-token',
    expectedUserId: null,
  } as const;
  jest
    .mocked(social.acquireSocialCredential)
    .mockResolvedValue(credential as never);
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() => expect(view.getByLabelText('Email')).toBeTruthy());
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByText('Continue with Google'));
  await waitFor(() =>
    expect(social.signInWithSocialCredential).toHaveBeenCalledWith(credential),
  );
  expect(registration.authorizeRegistration).toHaveBeenCalledWith(
    'opaque-memory-only',
    credential,
  );
  expect(
    jest.mocked(registration.authorizeRegistration).mock.invocationCallOrder[0],
  ).toBeLessThan(
    jest.mocked(social.signInWithSocialCredential).mock.invocationCallOrder[0],
  );
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('a canceled native dialog does not authorize or create an account', async () => {
  jest.mocked(social.acquireSocialCredential).mockResolvedValue(null);
  const view = render(<RegistrationForm />);
  await assess(view);
  await waitFor(() => expect(view.getByLabelText('Email')).toBeTruthy());
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByText('Continue with Google'));
  await waitFor(() =>
    expect(social.acquireSocialCredential).toHaveBeenCalled(),
  );
  expect(registration.authorizeRegistration).not.toHaveBeenCalled();
  expect(social.signInWithSocialCredential).not.toHaveBeenCalled();
});

test('existing-account enrollment binds completion to that account', async () => {
  jest.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { user: { id: 'alice' } } },
    error: null,
  } as never);
  const complete = jest.fn(async () => {});
  const view = render(
    <RegistrationForm existingAccountId="alice" onComplete={complete} />,
  );
  await assess(view);
  await waitFor(() =>
    expect(view.getByLabelText('Continue to Prompt Wars')).toBeTruthy(),
  );
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Continue to Prompt Wars'));
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(registration.completeExistingEligibility).toHaveBeenCalledWith(
    'opaque-memory-only',
    'alice',
  );
  expect(registration.authorizeRegistration).not.toHaveBeenCalled();
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('guest play requires eligibility and terms before redeeming a server permit', async () => {
  jest.mocked(registration.getRegistrationConfiguration).mockResolvedValue({
    ...ready,
    guest_signup_enabled: true,
  });
  jest.mocked(registration.authorizeRegistration).mockResolvedValue({
    authorized: true,
    authorization_token: 'guest-secret',
    permit_expires_at: '2099-01-01T00:00:00Z',
  } as never);
  jest.mocked(signInAnonymouslySafely).mockResolvedValue({
    data: { session: { user: { id: 'guest', is_anonymous: true } } },
    error: null,
  } as never);
  const view = render(<RegistrationForm guest />);
  expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  await assess(view);
  const play = await view.findByLabelText('Play now');
  expect(play).toBeDisabled();
  expect(view.queryByLabelText('Email')).toBeNull();
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(play);
  await waitFor(() =>
    expect(signInAnonymouslySafely).toHaveBeenCalledWith(
      { options: { data: { registration_authorization: 'guest-secret' } } },
      expect.objectContaining({ revision: expect.any(Number) }),
    ),
  );
  expect(registration.authorizeRegistration).toHaveBeenCalledWith(
    'opaque-memory-only',
    { provider: 'anonymous' },
  );
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test.each([undefined, false])(
  'guest intake fails closed when its server flag is %s',
  async (guest_signup_enabled) => {
    jest
      .mocked(registration.getRegistrationConfiguration)
      .mockResolvedValue({ ...ready, guest_signup_enabled });
    const view = render(<RegistrationForm guest />);
    await view.findByText('Guest play is not available yet');
    expect(view.queryByLabelText('Date of birth')).toBeNull();
    expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  },
);

test.each(['pending', 'consent_unavailable', 'denied', 'revoked'])(
  'guest play remains closed for consent state %s',
  async (status) => {
    jest
      .mocked(registration.getRegistrationConfiguration)
      .mockResolvedValue({ ...ready, guest_signup_enabled: true });
    jest
      .mocked(registration.startRegistration)
      .mockResolvedValue({ ...pending, status } as never);
    const view = render(<RegistrationForm guest />);
    await assess(view);
    await waitFor(() =>
      expect(view.queryByLabelText('Date of birth')).toBeNull(),
    );
    expect(view.queryByLabelText('Play now')).toBeNull();
    expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  },
);

test('an expired guest permit cannot reach anonymous authentication', async () => {
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockResolvedValue({ ...ready, guest_signup_enabled: true });
  jest.mocked(registration.authorizeRegistration).mockResolvedValue({
    authorized: true,
    authorization_token: 'expired-secret',
    permit_expires_at: '2000-01-01T00:00:00Z',
  } as never);
  const view = render(<RegistrationForm guest />);
  await assess(view);
  await view.findByLabelText('Play now');
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Play now'));
  await view.findByLabelText('Start again');
  expect(signInAnonymouslySafely).not.toHaveBeenCalled();
});

test('a restored account while guest authorization is in flight prevents replacement', async () => {
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockResolvedValue({ ...ready, guest_signup_enabled: true });
  let resolve!: (value: unknown) => void;
  jest.mocked(registration.authorizeRegistration).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }) as never,
  );
  const view = render(<RegistrationForm guest />);
  await assess(view);
  await view.findByLabelText('Play now');
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Play now'));
  await waitFor(() =>
    expect(registration.authorizeRegistration).toHaveBeenCalled(),
  );
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({
      data: { session: { user: { id: 'saved-account' } } },
      error: null,
    } as never);
  await act(async () =>
    resolve({
      authorization_token: 'guest-secret',
      permit_expires_at: '2099-01-01T00:00:00Z',
    }),
  );
  expect(signInAnonymouslySafely).not.toHaveBeenCalled();
  expect(
    view.getByText(
      'Your signed-in account changed. Reopen registration to continue.',
    ),
  ).toBeTruthy();
});

test('leaving guest creation invalidates its in-flight isolated authentication', async () => {
  jest
    .mocked(registration.getRegistrationConfiguration)
    .mockResolvedValue({ ...ready, guest_signup_enabled: true });
  jest
    .mocked(registration.authorizeRegistration)
    .mockResolvedValue({
      authorization_token: 'guest-secret',
      permit_expires_at: '2099-01-01T00:00:00Z',
    } as never);
  let finish!: (value: unknown) => void;
  jest.mocked(signInAnonymouslySafely).mockReturnValue(
    new Promise((done) => {
      finish = done;
    }) as never,
  );
  const view = render(<RegistrationForm guest />);
  await assess(view);
  await view.findByLabelText('Play now');
  fireEvent.press(
    view.getByLabelText(
      'I agree to the Terms and acknowledge the Privacy Policy',
    ),
  );
  fireEvent.press(view.getByLabelText('Play now'));
  await waitFor(() => expect(signInAnonymouslySafely).toHaveBeenCalled());
  const operation = jest.mocked(signInAnonymouslySafely).mock.calls[0][1]!;
  view.unmount();
  expect(() => assertAuthOperationCurrent(operation)).toThrow();
  await act(async () =>
    finish({ data: { session: null }, error: { code: 'session_changed' } }),
  );
});

test('leaving an old registration does not cancel a newer authentication intent', async () => {
  const view = render(<RegistrationForm />);
  await assess(view);
  const newer = beginAuthOperation();
  view.unmount();
  expect(() => assertAuthOperationCurrent(newer)).not.toThrow();
});
