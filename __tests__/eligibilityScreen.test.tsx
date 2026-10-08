import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import EligibilityScreen from '@/app/(auth)/eligibility';

const mockRefresh = jest.fn(async () => {});
const mockPush = jest.fn();
const mockRegister = jest.fn();
let mockAuth: Record<string, unknown>;
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  Redirect: () => null,
}));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@/components/auth/RegistrationForm', () => ({
  RegistrationForm: (props: unknown) => {
    mockRegister(props);
    return null;
  },
}));

beforeEach(() => {
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  jest.clearAllMocks();
  mockAuth = {
    user: { id: 'alice' },
    loading: false,
    recoveryPending: false,
    recoveryProcessing: false,
    eligibilityLoading: false,
    eligibilityError: false,
    refreshEligibility: mockRefresh,
    eligibility: { status: 'revoked', can_play: false },
    signOut: jest.fn(async () => {}),
  };
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
});

test.each(['revoked', 'deleted'])(
  'restricted %s accounts keep management access without re-enrollment',
  (status) => {
    mockAuth.eligibility = { status, can_play: false };
    const view = render(<EligibilityScreen />);
    expect(mockRegister).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Account settings'));
    expect(mockPush).toHaveBeenCalledWith('/(profile)/settings');
    expect(view.getByLabelText('Account deletion help')).toBeTruthy();
  },
);

test('an unresolved eligibility failure offers retry and management instead of intake', () => {
  mockAuth.eligibility = null;
  mockAuth.eligibilityError = true;
  const view = render(<EligibilityScreen />);
  expect(mockRegister).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('Retry'));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(view.getByLabelText('Account settings')).toBeTruthy();
});

test('only a needs-registration decision mounts intake bound to the signed-in account', () => {
  mockAuth.eligibility = { status: 'needs_registration', can_play: false };
  render(<EligibilityScreen />);
  expect(mockRegister).toHaveBeenCalledWith({
    existingAccountId: 'alice',
    onComplete: mockRefresh,
  });
});

test('a restricted guest must confirm progress loss before signing out', async () => {
  mockAuth.user = { id: 'guest', is_anonymous: true };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<EligibilityScreen />);
  fireEvent.press(view.getByLabelText('Sign out'));
  expect(mockAuth.signOut).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0][2]!;
  await act(async () =>
    buttons
      .find((button) => button.text === 'Continue without securing')
      ?.onPress?.(),
  );
  expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  alert.mockRestore();
});

test('a stale guest exit confirmation cannot sign out another account', async () => {
  mockAuth.user = { id: 'guest', is_anonymous: true };
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<EligibilityScreen />);
  fireEvent.press(view.getByLabelText('Sign out'));
  const buttons = alert.mock.calls[0][2]!;
  mockAuth.user = { id: 'another', is_anonymous: false };
  view.rerender(<EligibilityScreen />);
  await act(async () =>
    buttons
      .find((button) => button.text === 'Continue without securing')
      ?.onPress?.(),
  );
  expect(mockAuth.signOut).not.toHaveBeenCalled();
  alert.mockRestore();
});
