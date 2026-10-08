import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { User } from '@supabase/supabase-js';
import { EmailLinkingForm } from '@/components/auth/EmailLinkingForm';
import {
  requestEmailLink,
  verifyEmailLink,
  setLinkedEmailPassword,
  EmailLinkingError,
} from '@/utils/emailLinking';
jest.mock('@/utils/emailLinking', () => ({
  ...jest.requireActual('@/utils/emailLinking'),
  requestEmailLink: jest.fn(),
  verifyEmailLink: jest.fn(),
  setLinkedEmailPassword: jest.fn(),
}));
jest.mock('@/utils/supabase', () => ({ supabase: {} }));
const guest = {
  id: 'guest',
  is_anonymous: true,
  identities: [],
} as unknown as User;
const pending = { ...guest, new_email: 'player@example.com' };
const verified = {
  ...guest,
  is_anonymous: false,
  email: 'player@example.com',
  email_confirmed_at: '2026-09-30',
  identities: [{ provider: 'email' }],
} as User;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(requestEmailLink).mockResolvedValue(pending);
  jest.mocked(verifyEmailLink).mockResolvedValue(verified);
  jest.mocked(setLinkedEmailPassword).mockResolvedValue(verified);
});

test('connects email in verified steps on the same UUID', async () => {
  const complete = jest.fn();
  render(
    <EmailLinkingForm
      user={guest}
      onComplete={complete}
      onCancel={jest.fn()}
      onConflict={jest.fn()}
    />,
  );
  fireEvent.changeText(screen.getByLabelText('Email'), 'player@example.com');
  fireEvent.press(
    screen.getByRole('button', { name: 'Send verification code' }),
  );
  fireEvent.changeText(
    await screen.findByLabelText('Verification code'),
    '123456',
  );
  expect(setLinkedEmailPassword).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
  fireEvent.changeText(
    await screen.findByLabelText('Password'),
    'strongpassword',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
  await waitFor(() => expect(complete).toHaveBeenCalledWith(verified));
  expect(requestEmailLink).toHaveBeenCalledWith(
    'player@example.com',
    'guest',
    expect.any(Object),
  );
  expect(verifyEmailLink).toHaveBeenCalledWith(
    'player@example.com',
    '123456',
    'guest',
    expect.any(Object),
  );
  expect(setLinkedEmailPassword).toHaveBeenCalledWith(
    'strongpassword',
    'player@example.com',
    'guest',
    expect.any(Object),
  );
});

test.each(['verification', 'password'])(
  'resumes the %s step from the server user',
  async (step) => {
    render(
      <EmailLinkingForm
        user={step === 'verification' ? pending : verified}
        onComplete={jest.fn()}
        onCancel={jest.fn()}
        onConflict={jest.fn()}
      />,
    );
    expect(
      screen.getByLabelText(
        step === 'verification' ? 'Verification code' : 'Password',
      ),
    ).toBeTruthy();
    expect(requestEmailLink).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Keep playing' })).toBeEnabled();
  },
);

test('keeps verification available after a rejected code', async () => {
  jest
    .mocked(verifyEmailLink)
    .mockRejectedValueOnce(
      new EmailLinkingError('otp_expired', 'The code expired.'),
    );
  render(
    <EmailLinkingForm
      user={pending}
      onComplete={jest.fn()}
      onCancel={jest.fn()}
      onConflict={jest.fn()}
    />,
  );
  fireEvent.changeText(screen.getByLabelText('Verification code'), '111111');
  fireEvent.press(screen.getByRole('button', { name: 'Verify email' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The code expired.',
  );
  expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
  expect(setLinkedEmailPassword).not.toHaveBeenCalled();
});

test('ignores a late completion after the player leaves the form', async () => {
  let finish!: (user: User) => void;
  jest.mocked(setLinkedEmailPassword).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const complete = jest.fn();
  const { unmount } = render(
    <EmailLinkingForm
      user={verified}
      onComplete={complete}
      onCancel={jest.fn()}
      onConflict={jest.fn()}
    />,
  );
  fireEvent.changeText(screen.getByLabelText('Password'), 'strongpassword');
  fireEvent.press(screen.getByRole('button', { name: 'Save password' }));
  unmount();
  await act(async () => finish(verified));
  expect(complete).not.toHaveBeenCalled();
});
