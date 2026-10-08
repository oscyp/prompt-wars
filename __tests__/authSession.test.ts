import { supabase } from '@/utils/supabase';
import {
  beginAuthOperation,
  commitLinkedSessionSafely,
  setRecoverySessionSafely,
  signInWithIdTokenSafely,
  signInWithPasswordSafely,
  signInAnonymouslySafely,
  signOutSafely,
  signUpWithPasswordSafely,
  updatePasswordSafely,
} from '@/utils/authSession';

const mockExchange = {
  signInWithPassword: jest.fn(),
  signInWithIdToken: jest.fn(),
  signUp: jest.fn(),
  signInAnonymously: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockExchange })),
}));
jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signInWithIdToken: jest.fn(),
      signUp: jest.fn(),
      signInAnonymously: jest.fn(),
      setSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      updateUser: jest.fn(),
    },
  },
}));
const session = (id: string) => ({
  user: { id },
  access_token: `access-${id}`,
  refresh_token: `refresh-${id}`,
});
const response = (id: string) => ({
  data: { session: session(id), user: session(id).user },
  error: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let mockActiveAccount: string | null;
beforeEach(() => {
  jest.clearAllMocks();
  beginAuthOperation();
  mockActiveAccount = null;
  jest.mocked(supabase.auth.getSession).mockImplementation(
    async () =>
      ({
        data: {
          session: mockActiveAccount ? session(mockActiveAccount) : null,
        },
        error: null,
      }) as never,
  );
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.test';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-key';
  jest
    .mocked(supabase.auth.setSession)
    .mockImplementation(async ({ access_token }) => {
      mockActiveAccount = access_token.replace('access-', '');
      return response(mockActiveAccount) as never;
    });
  jest
    .mocked(supabase.auth.exchangeCodeForSession)
    .mockImplementation(async (code) => {
      mockActiveAccount = code;
      return response(code) as never;
    });
  jest.mocked(supabase.auth.signOut).mockImplementation(async () => {
    mockActiveAccount = null;
    return { error: null };
  });
});

test('password updates serialize before a newer recovery and cannot sign that recovery out', async () => {
  mockActiveAccount = 'a';
  const updating = deferred<{ data: { user: { id: string } }; error: null }>();
  jest.mocked(supabase.auth.updateUser).mockImplementationOnce(async () => {
    const result = await updating.promise;
    mockActiveAccount = 'a';
    return result as never;
  });
  const operation = beginAuthOperation();
  const update = updatePasswordSafely('new-password', 'a', operation);
  const settled = update.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  for (
    let tick = 0;
    tick < 10 && !jest.mocked(supabase.auth.updateUser).mock.calls.length;
    tick++
  )
    await Promise.resolve();
  expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1);
  const recovery = setRecoverySessionSafely({ code: 'b' });
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  updating.resolve({ data: { user: { id: 'a' } }, error: null });
  expect(await settled).toMatchObject({ error: { code: 'session_changed' } });
  await recovery;
  await expect(signOutSafely(operation)).rejects.toMatchObject({
    code: 'session_changed',
  });
  expect(mockActiveAccount).toBe('b');
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

test('a successful password update cannot complete an older recovery after a newer intent', async () => {
  mockActiveAccount = 'a';
  jest
    .mocked(supabase.auth.updateUser)
    .mockResolvedValue({ data: { user: { id: 'a' } }, error: null } as never);
  const operation = beginAuthOperation();
  await updatePasswordSafely('new-password', 'a', operation);
  await setRecoverySessionSafely({ code: 'b' });
  await expect(signOutSafely(operation)).rejects.toMatchObject({
    code: 'session_changed',
  });
  expect(mockActiveAccount).toBe('b');
  expect(supabase.auth.signOut).not.toHaveBeenCalled();
});

test('a password update verifies its recovery account before calling the SDK', async () => {
  mockActiveAccount = 'b';
  await expect(updatePasswordSafely('new-password', 'a')).rejects.toMatchObject(
    { code: 'session_changed' },
  );
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
});

test.each(['password', 'token', 'signup', 'anonymous'] as const)(
  'late %s exchange cannot overwrite a recovery session',
  async (method) => {
    const pending = deferred<ReturnType<typeof response>>();
    const sdkMethod =
      method === 'password'
        ? 'signInWithPassword'
        : method === 'token'
          ? 'signInWithIdToken'
          : method === 'anonymous'
            ? 'signInAnonymously'
            : 'signUp';
    mockExchange[sdkMethod].mockReturnValue(pending.promise);
    // Model auth-js's automatic session write if the global SDK is used directly.
    jest.mocked(supabase.auth[sdkMethod]).mockImplementation(async () => {
      const value = await pending.promise;
      mockActiveAccount = value.data.user.id;
      return value as never;
    });
    const attempt =
      method === 'password'
        ? signInWithPasswordSafely({
            email: 'a@example.test',
            password: 'password',
          })
        : method === 'token'
          ? signInWithIdTokenSafely({ provider: 'google', token: 'token' })
          : method === 'anonymous'
            ? signInAnonymouslySafely({
                options: { data: { registration_authorization: 'permit' } },
              })
            : signUpWithPasswordSafely({
                email: 'a@example.test',
                password: 'password',
              });
    const settled = attempt.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await setRecoverySessionSafely({ code: 'recovery-b' });
    pending.resolve(response('late-a'));
    expect(await settled).toMatchObject({ error: { code: 'session_changed' } });
    expect(mockActiveAccount).toBe('recovery-b');
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  },
);

test('authorized guest signup commits its isolated session', async () => {
  mockExchange.signInAnonymously.mockResolvedValue(response('guest'));
  const input = { options: { data: { registration_authorization: 'permit' } } };
  await signInAnonymouslySafely(input, beginAuthOperation());
  expect(mockExchange.signInAnonymously).toHaveBeenCalledWith(input);
  expect(mockActiveAccount).toBe('guest');
  expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
});

test('new sign-in intent cancels an older signup even when its network response finishes first', async () => {
  const older = deferred<ReturnType<typeof response>>();
  const newer = deferred<ReturnType<typeof response>>();
  mockExchange.signUp.mockReturnValue(older.promise);
  mockExchange.signInWithPassword.mockReturnValue(newer.promise);
  const signup = signUpWithPasswordSafely({
    email: 'a@example.test',
    password: 'password',
  });
  const settled = signup.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const login = signInWithPasswordSafely({
    email: 'b@example.test',
    password: 'password',
  });
  older.resolve(response('a'));
  expect(await settled).toMatchObject({ error: { code: 'session_changed' } });
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
  newer.resolve(response('b'));
  await login;
  expect(mockActiveAccount).toBe('b');
});

test('recovery and signout serialize behind an already-started session commit', async () => {
  const committing = deferred<ReturnType<typeof response>>();
  mockExchange.signInWithIdToken.mockResolvedValue(response('a'));
  jest.mocked(supabase.auth.setSession).mockImplementationOnce(async () => {
    const result = await committing.promise;
    mockActiveAccount = 'a';
    return result as never;
  });
  const login = signInWithIdTokenSafely({ provider: 'google', token: 'token' });
  const settled = login.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  for (
    let tick = 0;
    tick < 10 && !jest.mocked(supabase.auth.setSession).mock.calls.length;
    tick++
  )
    await Promise.resolve();
  expect(supabase.auth.setSession).toHaveBeenCalledTimes(1);
  const recovery = setRecoverySessionSafely({ code: 'b' });
  expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  committing.resolve(response('a'));
  expect(await settled).toMatchObject({ error: { code: 'session_changed' } });
  await recovery;
  expect(mockActiveAccount).toBe('b');
  await signOutSafely();
  expect(mockActiveAccount).toBeNull();
});

test('registration authorization work cannot create a new intent after recovery started', async () => {
  const signupOperation = beginAuthOperation();
  await setRecoverySessionSafely({ code: 'b' });
  await expect(
    signUpWithPasswordSafely(
      { email: 'a@example.test', password: 'password' },
      signupOperation,
    ),
  ).rejects.toMatchObject({ code: 'session_changed' });
  expect(mockExchange.signUp).not.toHaveBeenCalled();
  expect(mockActiveAccount).toBe('b');
});

test('email confirmation creates no global session and preserves the response', async () => {
  const awaitingEmail = {
    data: { user: { id: 'a' }, session: null },
    error: null,
  };
  mockExchange.signUp.mockResolvedValue(awaitingEmail);
  expect(
    await signUpWithPasswordSafely({
      email: 'a@example.test',
      password: 'password',
    }),
  ).toBe(awaitingEmail);
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

test('a linked commit checks the active account before publishing it', async () => {
  mockActiveAccount = 'b';
  await expect(
    commitLinkedSessionSafely(
      { ...session('a'), user: { id: 'a', is_anonymous: false } } as never,
      'a',
      beginAuthOperation(),
    ),
  ).rejects.toMatchObject({ code: 'session_changed' });
  expect(mockActiveAccount).toBe('b');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

test('a recovery waits for an already-started link commit and wins afterward', async () => {
  mockActiveAccount = 'a';
  const committing = deferred<ReturnType<typeof response>>();
  jest.mocked(supabase.auth.setSession).mockImplementationOnce(async () => {
    const result = await committing.promise;
    mockActiveAccount = 'a';
    return result as never;
  });
  const linkedSession = {
    ...session('a'),
    user: { id: 'a', is_anonymous: false },
  };
  const linking = commitLinkedSessionSafely(
    linkedSession as never,
    'a',
    beginAuthOperation(),
  );
  const settled = linking.catch((error) => error);
  for (
    let tick = 0;
    tick < 10 && !jest.mocked(supabase.auth.setSession).mock.calls.length;
    tick++
  )
    await Promise.resolve();
  expect(supabase.auth.setSession).toHaveBeenCalledTimes(1);
  const recovery = setRecoverySessionSafely({ code: 'b' });
  committing.resolve({
    data: { session: linkedSession, user: linkedSession.user },
    error: null,
  });
  expect(await settled).toMatchObject({ code: 'session_changed' });
  await recovery;
  expect(mockActiveAccount).toBe('b');
});
