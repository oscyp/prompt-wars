import { supabase } from '@/utils/supabase';
import { beginAuthOperation } from '@/utils/authSession';
import {
  requestEmailLink,
  verifyEmailLink,
  setLinkedEmailPassword,
} from '@/utils/emailLinking';

const mockIsolated = {
  setSession: jest.fn(),
  updateUser: jest.fn(),
  verifyOtp: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockIsolated })),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      setSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
    },
  },
}));
const guest = {
  user: { id: 'guest-id', is_anonymous: true, identities: [] },
  access_token: 'guest-access',
  refresh_token: 'guest-refresh',
};
const permanent = {
  ...guest,
  access_token: 'verified-access',
  user: {
    id: 'guest-id',
    is_anonymous: false,
    email: 'player@example.com',
    email_confirmed_at: '2026-09-30',
    identities: [{ provider: 'email' }],
  },
};
let mockActive: typeof guest | typeof permanent;
beforeEach(() => {
  jest.clearAllMocks();
  beginAuthOperation();
  mockActive = guest;
  (supabase.auth.getSession as jest.Mock).mockImplementation(async () => ({
    data: { session: mockActive },
    error: null,
  }));
  mockIsolated.setSession.mockImplementation(async () => ({
    data: { session: mockActive, user: mockActive.user },
    error: null,
  }));
  (supabase.auth.setSession as jest.Mock).mockImplementation(async (tokens) => {
    mockActive = tokens.access_token === 'verified-access' ? permanent : guest;
    return {
      data: { session: mockActive, user: mockActive.user },
      error: null,
    };
  });
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
});

test('requests email verification on the existing guest with no password or new account', async () => {
  mockIsolated.updateUser.mockResolvedValue({
    data: { user: { ...guest.user, new_email: 'player@example.com' } },
    error: null,
  });
  await expect(
    requestEmailLink(' Player@example.com ', 'guest-id'),
  ).resolves.toMatchObject({ id: 'guest-id', new_email: 'player@example.com' });
  expect(mockIsolated.updateUser).toHaveBeenCalledWith({
    email: 'player@example.com',
  });
  expect(mockActive.user.id).toBe('guest-id');
  expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  expect(supabase.auth.signUp).not.toHaveBeenCalled();
});

test('verifies email_change OTP then publishes the same permanent account', async () => {
  mockIsolated.verifyOtp.mockResolvedValue({
    data: { session: permanent, user: permanent.user },
    error: null,
  });
  await verifyEmailLink('player@example.com', '123456', 'guest-id');
  expect(mockIsolated.verifyOtp).toHaveBeenCalledWith({
    email: 'player@example.com',
    token: '123456',
    type: 'email_change',
  });
  expect(mockActive.user.id).toBe('guest-id');
  expect(mockActive.user.is_anonymous).toBe(false);
});

test.each(['account', 'anonymous', 'email', 'intent'])(
  'does not commit an OTP result with changed %s',
  async (failure) => {
    const invalid = {
      ...permanent,
      user: {
        ...permanent.user,
        id: failure === 'account' ? 'other-id' : 'guest-id',
        is_anonymous: failure === 'anonymous',
        email: failure === 'email' ? 'other@example.com' : 'player@example.com',
      },
    };
    mockIsolated.verifyOtp.mockImplementation(async () => {
      if (failure === 'intent') beginAuthOperation();
      return { data: { session: invalid, user: invalid.user }, error: null };
    });
    await expect(
      verifyEmailLink('player@example.com', '123456', 'guest-id'),
    ).rejects.toBeTruthy();
    expect(mockActive.user.is_anonymous).toBe(true);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  },
);

test('a failed verification is retryable and never changes the guest', async () => {
  mockIsolated.verifyOtp.mockResolvedValue({
    data: { session: null, user: null },
    error: { code: 'otp_expired' },
  });
  await expect(
    verifyEmailLink('player@example.com', '000000', 'guest-id'),
  ).rejects.toMatchObject({ code: 'otp_expired' });
  expect(mockActive).toEqual(guest);
});

test('an email collision preserves the guest and exposes a safe typed conflict', async () => {
  mockIsolated.updateUser.mockResolvedValue({
    data: { user: null },
    error: { code: 'email_exists', message: 'private response' },
  });
  await expect(
    requestEmailLink('taken@example.com', 'guest-id'),
  ).rejects.toMatchObject({ code: 'identity_collision' });
  expect(mockActive).toEqual(guest);
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

test('a password cannot be set before verified email ownership', async () => {
  await expect(
    setLinkedEmailPassword('strongpassword', 'player@example.com', 'guest-id'),
  ).rejects.toMatchObject({ code: 'verification_required' });
  expect(mockIsolated.updateUser).not.toHaveBeenCalled();
});

test('verified email password setup resumes on the same account', async () => {
  mockActive = permanent;
  mockIsolated.updateUser.mockResolvedValue({
    data: { user: permanent.user },
    error: null,
  });
  await setLinkedEmailPassword(
    'strongpassword',
    'player@example.com',
    'guest-id',
  );
  expect(mockIsolated.updateUser).toHaveBeenCalledWith({
    password: 'strongpassword',
  });
  expect(mockActive.user.id).toBe('guest-id');
});

test('late password completion cannot overwrite a newer account', async () => {
  mockActive = permanent;
  mockIsolated.updateUser.mockImplementation(async () => {
    beginAuthOperation();
    mockActive = { ...guest, user: { ...guest.user, id: 'new-guest' } };
    return { data: { user: permanent.user }, error: null };
  });
  await expect(
    setLinkedEmailPassword('strongpassword', 'player@example.com', 'guest-id'),
  ).rejects.toMatchObject({ code: 'session_changed' });
  expect(mockActive.user.id).toBe('new-guest');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});
