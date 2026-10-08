import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ResetPasswordScreen from '@/app/(auth)/reset-password';
import { signOutSafely, setRecoverySessionSafely } from '@/utils/authSession';
import { supabase } from '@/utils/supabase';

const mockRouter = { replace: jest.fn() };
const mockCompleteRecovery = jest.fn(signOutSafely);
const mockSession = {
  user: { id: 'a' },
  access_token: 'access-a',
  refresh_token: 'refresh-a',
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-font', () => ({ isLoaded: () => false }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/hooks/useNativeHeaderOffset', () => ({
  useNativeHeaderOffset: () => 0,
}));
jest.mock('@/utils/haptics', () => ({
  hapticError: jest.fn(),
  hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(),
}));
jest.mock('@/components', () => ({ InlineBanner: 'InlineBanner' }));
jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    session: mockSession,
    recoveryProcessing: false,
    completeRecovery: mockCompleteRecovery,
  }),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: mockSession },
        error: null,
      })),
      updateUser: jest.fn(),
      exchangeCodeForSession: jest.fn(async () => ({
        data: { user: { id: 'b' }, session: null },
        error: null,
      })),
      signOut: jest.fn(async () => ({ error: null })),
    },
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
});

test('duplicate reset presses perform one password write and an intervening recovery prevents completion/navigation', async () => {
  let finishUpdate!: (value: unknown) => void;
  jest.mocked(supabase.auth.updateUser).mockReturnValueOnce(
    new Promise((resolve) => {
      finishUpdate = resolve;
    }) as never,
  );
  const view = render(<ResetPasswordScreen />);
  fireEvent.changeText(view.getByLabelText('New password'), 'new-password');
  fireEvent.changeText(
    view.getByLabelText('Confirm new password'),
    'new-password',
  );
  const button = view.getByLabelText('Save new password');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  await waitFor(() =>
    expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1),
  );
  const recovery = setRecoverySessionSafely({ code: 'b' });
  await act(async () => {
    finishUpdate({ data: { user: { id: 'a' } }, error: null });
    await recovery;
  });
  expect(mockCompleteRecovery).not.toHaveBeenCalled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});
