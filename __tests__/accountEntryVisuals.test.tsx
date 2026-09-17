import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import WelcomeScreen from '@/app/(onboarding)/welcome';
import { supabase } from '@/utils/supabase';
import { startTutorial } from '@/utils/tutorial';
import { checkAccountEligibility } from '@/utils/safety';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
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
  SafeAreaView: 'SafeAreaView',
}));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: { auth: { signInWithPassword: jest.fn(), signUp: jest.fn() } },
}));
jest.mock('@/utils/tutorial', () => ({ startTutorial: jest.fn() }));
jest.mock('@/utils/safety', () => ({
  checkAccountEligibility: jest.fn(),
  getDeviceFingerprint: () => 'test-device',
}));

describe('account entry after visual migration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submits the same credentials through scalable native fields', async () => {
    jest
      .mocked(supabase.auth.signInWithPassword)
      .mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      } as never);
    const { getByLabelText } = render(<SignInScreen />);
    const email = getByLabelText('Email');
    const password = getByLabelText('Password');
    expect(email.props.allowFontScaling).toBe(true);
    expect(password.props.secureTextEntry).toBe(true);
    fireEvent.changeText(email, ' fighter@example.com ');
    fireEvent.changeText(password, 'my-password');
    fireEvent.press(getByLabelText('Sign in'));
    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'fighter@example.com',
        password: 'my-password',
      }),
    );
  });

  it('keeps the age gate required and sends its server metadata', async () => {
    jest
      .mocked(supabase.auth.signUp)
      .mockResolvedValue({
        data: {
          user: { id: 'fighter', identities: [{ id: 'identity' }] },
          session: {},
        },
        error: null,
      } as never);
    const { getByLabelText } = render(<SignUpScreen />);
    fireEvent.changeText(getByLabelText('Email'), 'fighter@example.com');
    fireEvent.changeText(getByLabelText('Password'), 'my-password');
    fireEvent.press(getByLabelText('Sign up'));
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('I confirm I am 18 years of age or older'));
    fireEvent.press(getByLabelText('Sign up'));
    await waitFor(() =>
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'fighter@example.com',
        password: 'my-password',
        options: { data: { age_confirmed: true } },
      }),
    );
  });

  it('retains both starter practice and customization with the anti-abuse signal', async () => {
    jest.mocked(checkAccountEligibility).mockResolvedValue({} as never);
    jest.mocked(startTutorial).mockResolvedValue('practice-id');
    const { getByLabelText } = render(<WelcomeScreen />);
    fireEvent.press(getByLabelText('Customize first'));
    expect(mockRouter.push).toHaveBeenCalledWith(
      '/(onboarding)/create-character',
    );
    fireEvent.press(getByLabelText('Play practice'));
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith(
        '/(battle)/prompt-entry?battleId=practice-id',
      ),
    );
    expect(checkAccountEligibility).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'onboarding_credits',
        deviceFingerprint: 'test-device',
      }),
    );
  });
});
