import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { supabase, invokeAuthenticatedFunction } from '@/utils/supabase';
import { beginAuthOperation } from '@/utils/authSession';
import {
  acquireSocialCredential,
  getAvailableSocialProviders,
  linkSocialIdentity,
  RegistrationRequiredError,
  signInWithSocialCredential,
} from '@/utils/socialAuth';

const mockLinkAuth = {
  signInWithIdToken: jest.fn(),
  setSession: jest.fn(),
  linkIdentity: jest.fn(),
  refreshSession: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockLinkAuth })),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signInWithIdToken: jest.fn(),
      linkIdentity: jest.fn(),
      setSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
  invokeAuthenticatedFunction: jest.fn(),
}));
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 },
}));
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));
jest.mock('react-native-nitro-google-signin', () => ({
  GoogleOneTapSignIn: {
    configure: jest.fn(),
    checkPlayServices: jest.fn(),
    presentExplicitSignIn: jest.fn(),
  },
}));

const originalPlatform = Platform.OS;
const signedIn = {
  user: {
    id: 'player-a',
    is_anonymous: false,
    identities: [{ provider: 'email' }],
  },
  access_token: 'access-a',
  refresh_token: 'refresh-a',
};
const rawNonce = '07'.repeat(32);
const rawState = '07'.repeat(16);

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
  process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = '1';
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
    'web.apps.googleusercontent.com';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID =
    'ios.apps.googleusercontent.com';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: null },
    error: null,
  });
  (AppleAuthentication.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Crypto.getRandomBytesAsync as jest.Mock).mockImplementation(
    async (size: number) => new Uint8Array(size).fill(7),
  );
  (Crypto.digestStringAsync as jest.Mock).mockResolvedValue('hashed-nonce');
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
    identityToken: 'apple-token',
    authorizationCode: 'apple-code',
    state: rawState,
    fullName: { givenName: 'Private' },
  });
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
    type: 'success',
    data: { idToken: 'google-token', user: { name: 'Private' } },
  });
  (GoogleOneTapSignIn.checkPlayServices as jest.Mock).mockResolvedValue(
    undefined,
  );
  (invokeAuthenticatedFunction as jest.Mock).mockResolvedValue({
    success: true,
  });
  (supabase.auth.setSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn, user: signedIn.user },
    error: null,
  });
  mockLinkAuth.setSession.mockResolvedValue({
    data: { session: signedIn, user: signedIn.user },
    error: null,
  });
  mockLinkAuth.refreshSession.mockResolvedValue({
    data: { session: signedIn, user: signedIn.user },
    error: null,
  });
  mockLinkAuth.linkIdentity.mockResolvedValue({
    data: {
      user: {
        ...signedIn.user,
        identities: [{ provider: 'email' }, { provider: 'google' }],
      },
      session: signedIn,
    },
    error: null,
  });
});
afterAll(() => {
  Platform.OS = originalPlatform;
});

it.each([
  ['ios', '1', ['apple', 'google']],
  ['android', '1', ['google']],
  ['web', '1', []],
  ['ios', '0', []],
])(
  'offers supported providers on %s with rollout %s',
  async (os, flag, expected) => {
    Platform.OS = os as typeof Platform.OS;
    process.env.EXPO_PUBLIC_SOCIAL_AUTH_ENABLED = flag;
    expect(await getAvailableSocialProviders()).toEqual(expected);
  },
);

it('hides Google when the native client is not configured', async () => {
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  expect(await getAvailableSocialProviders()).toEqual(['apple']);
});

it('keeps native credentials separate from creating a Supabase session', async () => {
  const credential = await acquireSocialCredential('apple');
  expect(credential).toEqual({
    provider: 'apple',
    idToken: 'apple-token',
    authorizationCode: 'apple-code',
    nonce: rawNonce,
    expectedUserId: null,
  });
  expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({
    nonce: 'hashed-nonce',
    state: rawState,
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
  });
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
});

it('rejects an Apple response from a different request', async () => {
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
    identityToken: 'apple-token',
    authorizationCode: 'apple-code',
    state: 'wrong',
  });
  await expect(acquireSocialCredential('apple')).rejects.toMatchObject({
    code: 'invalid_state',
  });
});

it.each(['ERR_REQUEST_CANCELED', 'SIGN_IN_CANCELLED'])(
  'treats %s as cancellation',
  async (code) => {
    const method =
      code === 'ERR_REQUEST_CANCELED'
        ? AppleAuthentication.signInAsync
        : GoogleOneTapSignIn.presentExplicitSignIn;
    (method as jest.Mock).mockRejectedValueOnce({ code });
    expect(
      await acquireSocialCredential(
        code === 'ERR_REQUEST_CANCELED' ? 'apple' : 'google',
      ),
    ).toBeNull();
  },
);

it('treats the Google cancelled response as cancellation', async () => {
  (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
    type: 'cancelled',
    data: null,
  });
  expect(await acquireSocialCredential('google')).toBeNull();
});

it('uses an explicit Google account selection with a secure nonce', async () => {
  const credential = await acquireSocialCredential('google');
  expect(credential).toEqual({
    provider: 'google',
    idToken: 'google-token',
    nonce: rawNonce,
    expectedUserId: null,
  });
  expect(GoogleOneTapSignIn.configure).toHaveBeenCalledWith(
    expect.objectContaining({
      webClientId: 'web.apps.googleusercontent.com',
      iosClientId: 'ios.apps.googleusercontent.com',
      nonce: 'hashed-nonce',
      autoSelectOnSignIn: false,
    }),
  );
});

it.each(['apple', 'google'] as const)(
  'rejects a missing %s token',
  async (provider) => {
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({
      identityToken: null,
      state: rawState,
    });
    (GoogleOneTapSignIn.presentExplicitSignIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: { idToken: '' },
    });
    await expect(acquireSocialCredential(provider)).rejects.toMatchObject({
      code: 'missing_token',
    });
  },
);

it.each(['hook_error', undefined])(
  'routes server registration eligibility errors (%s) through a typed error',
  async (code) => {
    const credential = (await acquireSocialCredential('google'))!;
    mockLinkAuth.signInWithIdToken.mockResolvedValue({
      data: { session: null, user: null },
      error: { code, message: 'registration_required' },
    });
    await expect(signInWithSocialCredential(credential)).rejects.toBeInstanceOf(
      RegistrationRequiredError,
    );
  },
);

it('invalidates a native credential after a newer auth intent even before the account changes', async () => {
  const credential = (await acquireSocialCredential('google'))!;
  beginAuthOperation();
  await expect(signInWithSocialCredential(credential)).rejects.toMatchObject({
    code: 'session_changed',
  });
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
});

it('exchanges the Apple raw nonce and records its revocation code after sign-in', async () => {
  const credential = (await acquireSocialCredential('apple'))!;
  mockLinkAuth.signInWithIdToken.mockImplementation(async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: signedIn },
      error: null,
    });
    return { data: { session: signedIn, user: signedIn.user }, error: null };
  });
  expect(await signInWithSocialCredential(credential)).toEqual(signedIn);
  expect(mockLinkAuth.signInWithIdToken).toHaveBeenCalledWith({
    provider: 'apple',
    token: 'apple-token',
    nonce: rawNonce,
  });
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith(
    'apple-authorization',
    { authorization_code: 'apple-code', nonce: rawNonce },
    { expectedAccountId: 'player-a' },
  );
});

it('refuses a credential if another account signed in during native selection', async () => {
  const credential = (await acquireSocialCredential('google'))!;
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  await expect(signInWithSocialCredential(credential)).rejects.toMatchObject({
    code: 'session_changed',
  });
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
});

it('links an identity and updates the session on the same account', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  const user = await linkSocialIdentity('google', 'player-a');
  expect(user?.id).toBe('player-a');
  expect(user?.identities?.map((identity) => identity.provider)).toEqual([
    'email',
    'google',
  ]);
  expect(mockLinkAuth.linkIdentity).toHaveBeenCalledWith({
    provider: 'google',
    token: 'google-token',
    nonce: rawNonce,
  });
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).toHaveBeenCalledWith({
    access_token: 'access-a',
    refresh_token: 'refresh-a',
  });
});

it('preserves the current session when the provider belongs to another account', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  mockLinkAuth.linkIdentity.mockResolvedValue({
    data: { user: null, session: null },
    error: { code: 'identity_already_exists', message: 'already linked' },
  });
  await expect(linkSocialIdentity('google', 'player-a')).rejects.toMatchObject({
    code: 'identity_collision',
  });
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

it('does not restore a signed-out session when a link finishes late', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  mockLinkAuth.linkIdentity.mockImplementationOnce(async () => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    return { data: { user: signedIn.user, session: signedIn }, error: null };
  });
  await expect(linkSocialIdentity('google', 'player-a')).rejects.toMatchObject({
    code: 'session_changed',
  });
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

it('retries Apple authorization retention for an identity already on this account', async () => {
  const appleUser = {
    ...signedIn.user,
    identities: [{ provider: 'email' }, { provider: 'apple' }],
  };
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  mockLinkAuth.setSession.mockResolvedValue({
    data: { session: signedIn, user: appleUser },
    error: null,
  });
  expect((await linkSocialIdentity('apple', 'player-a'))?.id).toBe('player-a');
  expect(mockLinkAuth.linkIdentity).not.toHaveBeenCalled();
  expect(invokeAuthenticatedFunction).toHaveBeenCalledWith(
    'apple-authorization',
    { authorization_code: 'apple-code', nonce: rawNonce },
    { expectedAccountId: 'player-a' },
  );
});

it('refuses to link when seeding an isolated session returns a different account', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  mockLinkAuth.setSession.mockResolvedValue({
    data: { session: signedIn, user: { id: 'player-b' } },
    error: null,
  });
  await expect(linkSocialIdentity('google', 'player-a')).rejects.toMatchObject({
    code: 'session_changed',
  });
  expect(mockLinkAuth.linkIdentity).not.toHaveBeenCalled();
});

it('publishes a permanent guest session without changing its UUID', async () => {
  const guest = {
    ...signedIn,
    user: { ...signedIn.user, is_anonymous: true, identities: [] },
  };
  const upgraded = {
    ...signedIn,
    access_token: 'upgraded-access',
    user: { ...signedIn.user, identities: [{ provider: 'google' }] },
  };
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: guest },
    error: null,
  });
  mockLinkAuth.setSession.mockResolvedValue({
    data: { session: guest, user: guest.user },
    error: null,
  });
  mockLinkAuth.linkIdentity.mockResolvedValue({
    data: { session: upgraded, user: upgraded.user },
    error: null,
  });
  let active: typeof guest | typeof upgraded = guest;
  (supabase.auth.setSession as jest.Mock).mockImplementation(async () => {
    active = upgraded;
    return { data: { session: upgraded, user: upgraded.user }, error: null };
  });
  expect((await linkSocialIdentity('google', 'player-a'))?.is_anonymous).toBe(
    false,
  );
  expect(active.user.id).toBe('player-a');
  expect(active.user.is_anonymous).toBe(false);
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
});

it.each(['wrong-account', 'still-anonymous', 'new-intent'])(
  'never commits a linked session after %s',
  async (failure) => {
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: signedIn },
      error: null,
    });
    const invalid = {
      ...signedIn,
      user: {
        ...signedIn.user,
        id: failure === 'wrong-account' ? 'player-b' : 'player-a',
        is_anonymous: failure === 'still-anonymous',
      },
    };
    mockLinkAuth.linkIdentity.mockImplementationOnce(async () => {
      if (failure === 'new-intent') beginAuthOperation();
      return { data: { session: invalid, user: invalid.user }, error: null };
    });
    await expect(linkSocialIdentity('google', 'player-a')).rejects.toBeTruthy();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  },
);

it('allows an explicitly requested guest account switch', async () => {
  const guest = { ...signedIn, user: { ...signedIn.user, is_anonymous: true } };
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: guest },
    error: null,
  });
  const credential = (await acquireSocialCredential('google'))!;
  mockLinkAuth.signInWithIdToken.mockResolvedValue({
    data: { session: signedIn, user: signedIn.user },
    error: null,
  });
  await expect(
    signInWithSocialCredential(credential, { allowAccountSwitch: true }),
  ).resolves.toEqual(signedIn);
});

it('does not allow a permanent account switch through the guest escape route', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: signedIn },
    error: null,
  });
  const credential = (await acquireSocialCredential('google'))!;
  await expect(
    signInWithSocialCredential(credential, { allowAccountSwitch: true }),
  ).rejects.toMatchObject({ code: 'already_signed_in' });
  expect(mockLinkAuth.signInWithIdToken).not.toHaveBeenCalled();
});
