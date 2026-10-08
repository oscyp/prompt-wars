import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import SettingsScreen from '@/app/(profile)/settings';
import {
  assertAuthOperationCurrent,
  beginAuthOperation,
} from '@/utils/authSession';

const mockSignOut = jest.fn();
const mockRouter = { push: jest.fn() };
const mockGetSession = jest.fn();
const mockSignInMethods = jest.fn((_props: unknown) => null);
let mockIsAnonymous = true;
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'guest-a', is_anonymous: mockIsAnonymous },
    signOut: mockSignOut,
  }),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
  invokeAuthenticatedFunction: jest.fn(),
}));
jest.mock('@/components/auth/SignInMethods', () => ({
  SignInMethods: (props: unknown) => mockSignInMethods(props),
}));
jest.mock('@/utils/profileData', () => ({ fetchProfileRow: async () => null }));
jest.mock('@/utils/notifications', () => ({
  getNotificationPreferences: async () => ({}),
  DEFAULT_NOTIFICATION_PREFERENCES: {},
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: async () => ({ status: 'granted' }),
}));
jest.mock('expo-application', () => ({ nativeBuildVersion: '1' }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.4.0' } }));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/utils/audioSettings', () => ({
  useAudioPreferences: () => ({ music: true, soundEffects: true }),
  setAudioPreference: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  mockIsAnonymous = true;
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'guest-a' } } },
  });
});

it('keeps a guest signed in until explicitly accepting the recovery warning', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<SettingsScreen />);
  await act(async () => {});
  fireEvent.press(view.getByLabelText('Sign out'));
  expect(mockSignOut).not.toHaveBeenCalled();
  await act(async () => {
    alert.mock.calls[0][2]
      ?.find((b) => b.text === 'Continue without securing')
      ?.onPress?.();
  });
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

it('loads an existing account only after confirmation without signing out the guest first', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<SettingsScreen />);
  await act(async () => {});
  const pendingLink = beginAuthOperation();
  fireEvent.press(view.getByLabelText('Load existing account'));
  expect(mockRouter.push).not.toHaveBeenCalled();
  await act(async () => {
    alert.mock.calls[0][2]
      ?.find((b) => b.text === 'Continue without securing')
      ?.onPress?.();
  });
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/(auth)/sign-in',
    params: { switchAccount: '1' },
  });
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(() => assertAuthOperationCurrent(pendingLink)).toThrow();
});

it('does not offer an unsupported existing-account switch for a linked player', async () => {
  mockIsAnonymous = false;
  const view = render(<SettingsScreen />);
  await act(async () => {});
  expect(view.queryByLabelText('Load existing account')).toBeNull();
  expect(mockSignInMethods).toHaveBeenLastCalledWith({
    onLoadExistingAccount: undefined,
  });
});

it('ignores a stale guest exit confirmation after the active account changes', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const view = render(<SettingsScreen />);
  await act(async () => {});
  fireEvent.press(view.getByLabelText('Sign out'));
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'other' } } },
  });
  await act(async () => {
    alert.mock.calls[0][2]
      ?.find((b) => b.text === 'Continue without securing')
      ?.onPress?.();
  });
  expect(mockSignOut).not.toHaveBeenCalled();
});
