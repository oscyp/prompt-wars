import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import EntryScreen from '@/app/(auth)/entry';
import { getRegistrationConfiguration } from '@/utils/registration';

const mockRouter = { push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Redirect: 'Redirect',
}));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock('@/utils/registration', () => ({
  getRegistrationConfiguration: jest.fn(),
}));
const ready = {
  enabled: true,
  guest_signup_enabled: true,
  guardian_consent_ready: false,
  minimum_client_version: '1.4.0',
};
beforeEach(() => {
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  jest.mocked(getRegistrationConfiguration).mockResolvedValue(ready);
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  delete process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED;
});

test('adult guest play opens independently of the combined social release', async () => {
  delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
  process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED = '1';
  jest.mocked(getRegistrationConfiguration).mockResolvedValue({
    ...ready,
    enabled: false,
    adult_guest_signup_enabled: true,
  });
  const view = render(<EntryScreen />);
  fireEvent.press(await view.findByLabelText('Play now'));
  expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/sign-up?guest=1');
  expect(view.getByLabelText('Sign in')).toBeEnabled();
  expect(view.getByLabelText('Create an account')).toBeEnabled();
});

test.each([false, undefined, 'true'])(
  'adult guest entry requires the strict server flag: %s',
  async (adult_guest_signup_enabled) => {
    delete process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED;
    process.env.EXPO_PUBLIC_ADULT_GUEST_ENABLED = '1';
    jest.mocked(getRegistrationConfiguration).mockResolvedValue({
      ...ready,
      enabled: false,
      adult_guest_signup_enabled,
    } as never);
    const view = render(<EntryScreen />);
    await waitFor(() => expect(view.getByLabelText('Sign in')).toBeEnabled());
    expect(view.queryByLabelText('Play now')).toBeNull();
  },
);

test('offers guest play and returning sign-in as separate paths', async () => {
  const view = render(<EntryScreen />);
  fireEvent.press(await view.findByLabelText('Play now'));
  expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/sign-up?guest=1');
  fireEvent.press(view.getByLabelText('Sign in'));
  expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/sign-in');
  fireEvent.press(view.getByLabelText('Create an account'));
  expect(mockRouter.push).toHaveBeenCalledWith('/(auth)/sign-up');
});

test.each([
  { ...ready, enabled: false },
  { ...ready, guest_signup_enabled: false },
  {
    enabled: true,
    guardian_consent_ready: false,
    minimum_client_version: '1.4.0',
  },
])(
  'keeps guest play closed unless both server flags enable it: %j',
  async (configuration) => {
    jest.mocked(getRegistrationConfiguration).mockResolvedValue(configuration);
    const view = render(<EntryScreen />);
    await waitFor(() =>
      expect(view.queryByText('Checking guest play…')).toBeNull(),
    );
    expect(view.queryByLabelText('Play now')).toBeNull();
    expect(view.getByLabelText('Sign in')).toBeEnabled();
  },
);

test('configuration failure keeps sign-in available and guest play requires an explicit retry', async () => {
  jest
    .mocked(getRegistrationConfiguration)
    .mockRejectedValueOnce(new Error('offline'));
  const view = render(<EntryScreen />);
  await view.findByText('Could not check guest play');
  expect(view.queryByLabelText('Play now')).toBeNull();
  expect(view.getByLabelText('Sign in')).toBeEnabled();
  fireEvent.press(view.getByLabelText('Retry'));
  expect(await view.findByLabelText('Play now')).toBeEnabled();
});
